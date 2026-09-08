"use client";

import { useAgent } from "./AgentProvider";
import { AgentMessage } from "./AgentMessage";
import { AgentComposer } from "./AgentComposer";
import { ToolStatusLine } from "./ToolStatusLine";
import { EmptyState } from "./EmptyState";

function ConversationBody() {
  const { state } = useAgent();
  const { messages, isStreaming, currentStream } = state;

  const runningTool = currentStream?.toolCalls.find(
    (tc) => tc.status === "running"
  );

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          {messages.map((msg) => (
            <AgentMessage key={msg.id} message={msg} />
          ))}

          {isStreaming && currentStream && (
            <AgentMessage
              message={{ role: "assistant", content: currentStream.text }}
            />
          )}

          {runningTool && <ToolStatusLine label={runningTool.label} />}
        </>
      )}
    </div>
  );
}

export default function AgentPanel() {
  const { state } = useAgent();
  const { mode, isCollapsed, messages } = state;

  // Collapsed pill — shows regardless of mode when isCollapsed is true
  if (isCollapsed) {
    const lastMessage = messages[messages.length - 1];
    return (
      <div
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          borderRadius: "9999px",
          padding: "12px 20px",
          maxWidth: "300px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {lastMessage ? lastMessage.content : "Agent"}
      </div>
    );
  }

  // Fullscreen mode
  if (mode === "fullscreen") {
    return (
      <div
        style={{
          width: "760px",
          margin: "0 auto",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <ConversationBody />
        <AgentComposer />
      </div>
    );
  }

  // Docked mode
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "400px",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <ConversationBody />
      <AgentComposer />
    </div>
  );
}
