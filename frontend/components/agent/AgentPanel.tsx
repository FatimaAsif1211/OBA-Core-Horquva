"use client";

import { useAgent } from "./AgentProvider";

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
        }}
      >
        {/* TAYYABA (Task 12.5): replace this line with <AgentMessage /> list,
            mapped over `messages` from state above */}
        <div>Messages go here</div>

        {/* TAYYABA (Task 12.5): replace this line with <AgentComposer />,
            wired to sendMessage() and abort() from useAgent() */}
        <div>Composer goes here</div>
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
      }}
    >
      {/* TAYYABA (Task 12.5): same components as fullscreen above,
          just rendered inside this docked container instead */}
      <div>Messages go here</div>
      <div>Composer goes here</div>
    </div>
  );
}
