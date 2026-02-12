import type { Plugin } from "@opencode-ai/plugin"
import { readFile, writeFile, unlink, mkdtemp } from "node:fs/promises"
import { execSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"

export const MessageInterceptorPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  let config = {
    logLevel: "info",
    enableEditor: true,
    editor: process.env.EDITOR || "code -w",
    autoEdit: false,
    showSystemMessages: true,
    messageTypes: ["user", "assistant"]
  }

  // Strip JSONC comments (// and /* */) for config parsing
  const stripJsonComments = (str: string): string => {
    return str
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
  }

  try {
    // Try .micromanager.jsonc first, then fall back to .micromanager.json
    let configData: string
    try {
      configData = await readFile(join(directory, ".micromanager.jsonc"), "utf-8")
    } catch {
      configData = await readFile(join(directory, ".micromanager.json"), "utf-8")
    }

    const loadedConfig = JSON.parse(stripJsonComments(configData))
    config = { ...config, ...loadedConfig }
    client.app.log({
      body: {
        service: "micromanager",
        level: "info",
        message: "Configuration loaded from .micromanager.json",
        extra: { config }
      }
    })
  } catch (error: any) {
    client.app.log({
      body: {
        service: "micromanager",
        level: "warn",
        message: "Using default configuration",
        extra: { error: error.message }
      }
    })
  }

  const analytics = {
    messagesIntercepted: 0,
    messagesEdited: 0,
    editorSessions: 0
  }

  const log = (level: "debug" | "info" | "warn" | "error", message: string, data?: any) => {
    const levels = ["debug", "info", "warn", "error"]
    const currentLevelIndex = levels.indexOf(config.logLevel)
    const messageLevelIndex = levels.indexOf(level)

    if (messageLevelIndex >= currentLevelIndex) {
      client.app.log({
        body: {
          service: "micromanager",
          level,
          message,
          extra: data
        }
      })
    }
  }

  // Captured by experimental.chat.system.transform if it fires first
  let capturedSystem: string[] = []
  let capturedModel: any = null

  // Format the full LLM context for display/editing
  const formatFullContext = (
    system: string[],
    messages: { role: string; parts: any[] }[],
    model: any
  ): string => {
    const timestamp = new Date().toISOString()
    const lines: string[] = []

    lines.push("# OpenCode Micromanager - Full LLM Context")
    lines.push("")
    lines.push(`**Timestamp:** ${timestamp}`)

    if (model) {
      lines.push(`**Model:** ${model.providerID || model}/${model.modelID || ""}`)
    }

    lines.push(`**Messages:** ${messages.length}`)
    lines.push("")

    // System prompt
    if (system.length > 0) {
      lines.push("## System Prompt")
      lines.push("")

      for (const s of system) {
        lines.push(s)
        lines.push("")
      }

      lines.push("---")
      lines.push("")
    }

    // All messages in the conversation
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const isLast = i === messages.length - 1
      const roleLabel = msg.role.toUpperCase()

      if (isLast && msg.role === "user") {
        lines.push(`## [${i + 1}/${messages.length}] ${roleLabel} (Current - Editable)`)
      } else {
        lines.push(`## [${i + 1}/${messages.length}] ${roleLabel}`)
      }

      lines.push("")

      for (const part of msg.parts) {
        if (part.type === "text") {
          lines.push(part.text)
        } else if (part.type === "tool") {
          lines.push(`**[Tool: ${part.tool || part.name || "unknown"}]**`)

          if (part.input) {
            lines.push("```json")
            lines.push(JSON.stringify(part.input, null, 2))
            lines.push("```")
          }

          if (part.output) {
            lines.push("Output:")
            lines.push("```")
            lines.push(typeof part.output === "string" ? part.output : JSON.stringify(part.output, null, 2))
            lines.push("```")
          }
        } else {
          lines.push(`[${part.type}: ${JSON.stringify(part).substring(0, 200)}]`)
        }

        lines.push("")
      }

      // Put the edit separator before the last user message content
      if (isLast && msg.role === "user") {
        // Already rendered above -- the separator goes before the content
      }

      lines.push("---")
      lines.push("")
    }

    return lines.join("\n")
  }

  return {
    // Capture the system prompt
    "experimental.chat.system.transform": async (input, output) => {
      capturedSystem = [...output.system]
      capturedModel = input.model || null

      log("info", "System prompt captured", {
        systemParts: output.system.length,
        totalLength: output.system.reduce((sum, s) => sum + s.length, 0)
      })
    },

    // This hook receives the FULL message list being sent to the LLM.
    // We open the editor here so the user can see everything.
    "experimental.chat.messages.transform": async (input, output) => {
      analytics.messagesIntercepted++

      const messages = output.messages.map((m) => ({
        role: m.info.role,
        parts: m.parts
      }))

      log("info", "Full message context captured", {
        messageCount: output.messages.length,
        systemAvailable: capturedSystem.length > 0
      })

      if (!config.enableEditor || !config.autoEdit) {
        return
      }

      // Find the last user message to check if there's anything to edit
      const lastMsg = output.messages[output.messages.length - 1]

      if (!lastMsg) {
        return
      }

      const hasTextParts = lastMsg.parts.some((p) => p.type === "text")

      if (!hasTextParts) {
        return
      }

      try {
        const formattedContext = formatFullContext(
          config.showSystemMessages ? capturedSystem : [],
          messages,
          capturedModel
        )

        const tempDir = await mkdtemp(join(tmpdir(), "opencode-message-"))
        const tempFile = join(tempDir, "message.md")
        await writeFile(tempFile, formattedContext)

        log("info", "Opening editor for full context review", {
          tempFile,
          messageCount: messages.length,
          systemParts: capturedSystem.length
        })

        execSync(`${config.editor} ${tempFile}`, { stdio: "inherit" })
        analytics.editorSessions++

        // Read back the edited file
        const editedContent = await readFile(tempFile, "utf-8")

        // Find the last "Current - Editable" section and extract its content
        // We look for the last "## [N/N] USER (Current - Editable)" header
        const editableMarker = "(Current - Editable)"
        const markerIndex = editedContent.lastIndexOf(editableMarker)

        if (markerIndex !== -1) {
          // Find the start of content after the header line
          const afterMarker = editedContent.indexOf("\n", markerIndex)

          if (afterMarker !== -1) {
            // Get content from after the header to the next "---" or end of file
            let contentAfter = editedContent.substring(afterMarker + 1)

            // Strip leading blank lines
            contentAfter = contentAfter.replace(/^\n+/, "")

            // Find the trailing "---" separator
            const trailingSeparator = contentAfter.lastIndexOf("\n---")

            if (trailingSeparator !== -1) {
              contentAfter = contentAfter.substring(0, trailingSeparator)
            }

            const newText = contentAfter.trim()

            // Update the last user message's text parts
            for (let i = 0; i < lastMsg.parts.length; i++) {
              const part = lastMsg.parts[i]

              if (part.type === "text") {
                (lastMsg.parts[i] as any).text = newText
                analytics.messagesEdited++

                log("info", "User message edited successfully", {
                  originalLength: (part as any).text?.length,
                  newLength: newText.length
                })

                break
              }
            }
          }
        }

        await unlink(tempFile)
      } catch (error: any) {
        log("error", "Failed to edit message", { error: error.message })
      }
    },

    // Keep chat.message for analytics/logging only
    "chat.message": async (input, output) => {
      log("debug", "chat.message fired", {
        sessionID: input.sessionID,
        agent: input.agent,
        partsCount: output.parts.length
      })
    },

    event: async ({ event }) => {
      if (event.type === "session.created") {
        log("info", "New session started", {
          timestamp: new Date().toISOString()
        })

        analytics.messagesIntercepted = 0
        analytics.messagesEdited = 0
        analytics.editorSessions = 0
      }
    },

    "tool.execute.before": async (input, output) => {
      log("debug", "Tool execution intercepted", {
        tool: input.tool,
        sessionID: input.sessionID,
        callID: input.callID
      })
    }
  }
}
