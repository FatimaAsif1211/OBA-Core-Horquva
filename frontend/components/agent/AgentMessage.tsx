'use client';

type AgentMessageProps = {
  message: {
    role: 'user' | 'assistant';
    content: string;
  };
};

export function AgentMessage({ message }: AgentMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`mb-4 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-[var(--accent-dim)] text-[var(--text-primary)]'
            : 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
        }`}
      >
        <p className="whitespace-pre-wrap break-words text-sm leading-6">
          {message.content}
        </p>
      </div>
    </div>
  );
}

export default AgentMessage;
