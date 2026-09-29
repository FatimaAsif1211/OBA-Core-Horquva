'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Minus,
  GitFork,
  Users,
  Bot,
  X,
} from 'lucide-react';
import {
  changeImpactApi,
  type ChangeImpactEvent,
} from '../../lib/api';

interface Props {
  workflowId?: string;
  workflowName?: string;
  entityId?: string;
  entityType?: string;
}

function Delta({
  value,
  goodWhenUp = false,
}: {
  value: number | null | undefined;
  goodWhenUp?: boolean;
}) {
  if (value === null || value === undefined || value === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[color:var(--text-tertiary)]">
        <Minus className="w-3 h-3" />
        No change
      </span>
    );
  }

  const positive = value > 0;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${
        positive === goodWhenUp
          ? 'text-emerald-400'
          : 'text-red-400'
      }`}
    >
      {positive ? (
        <ArrowUp className="w-3 h-3" />
      ) : (
        <ArrowDown className="w-3 h-3" />
      )}

      {positive ? '+' : ''}
      {value}
    </span>
  );
}

function matchesTarget(
  event: ChangeImpactEvent,
  entityId?: string,
  entityType?: string,
) {
  if (!entityId) {
    return false;
  }

  if (
    String(event.target_id) === String(entityId) &&
    (!entityType || event.target_type === entityType)
  ) {
    return true;
  }

  return (
    event.impact.agents.some(
      agent => String(agent.agentId) === String(entityId),
    ) ||
    event.impact.people.some(
      person => String(person.employeeId) === String(entityId),
    ) ||
    event.impact.downstream.agents.some(
      agent => String(agent.id) === String(entityId),
    )
  );
}

function matchesWorkflow(
  event: ChangeImpactEvent,
  workflowId?: string,
  workflowName?: string,
) {
  return event.impact.downstream.workflows.some(workflow => {
    return (
      (workflowId &&
        String(workflow.id) === String(workflowId)) ||
      (workflowName && workflow.name === workflowName)
    );
  });
}

function normalizeEvents(
  list: ChangeImpactEvent[],
): ChangeImpactEvent[] {
  return list.map(event => {
    const impact = (event.impact ?? {}) as Partial<
      ChangeImpactEvent['impact']
    >;

    return {
      ...event,
      impact: {
        note: impact.note ?? null,
        agents: impact.agents ?? [],
        people: impact.people ?? [],
        spofChanges: impact.spofChanges ?? [],
        downstream: {
          agents: impact.downstream?.agents ?? [],
          workflows: impact.downstream?.workflows ?? [],
        },
      },
    };
  });
}

export function ChangeImpactPanel({
  workflowId,
  workflowName,
  entityId,
  entityType,
}: Props) {
  const [events, setEvents] = useState<ChangeImpactEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await changeImpactApi.events();

        if (!cancelled) {
          setEvents(
            normalizeEvents(response.events ?? []),
          );
        }
      } catch {
        if (!cancelled) {
          setEvents([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || dismissed) {
    return null;
  }

  const matchingEvents = events.filter(event => {
    const entityMatch = matchesTarget(
      event,
      entityId,
      entityType,
    );

    const workflowMatch = matchesWorkflow(
      event,
      workflowId,
      workflowName,
    );

    return entityMatch || workflowMatch;
  });

  const pricedEvents = matchingEvents.filter(
    event => event.priced,
  );

  if (pricedEvents.length === 0) {
    return null;
  }

  const latest = pricedEvents[0];

  return (
    <div className="card overflow-hidden border border-orange-500/20 bg-orange-500/[0.03]">
      {/* Header */}
      <div className="px-5 py-4 border-b border-orange-500/10 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
              Change → Impact
            </h3>

            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
              Recent change affecting this view
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 rounded hover:bg-[var(--bg-hover)]"
          aria-label="Dismiss change impact"
        >
          <X className="w-4 h-4 text-[color:var(--text-tertiary)]" />
        </button>
      </div>

      {/* Content */}
      <div className="px-5 py-4 space-y-4">
        {/* Change description */}
        <div>
          <p className="text-xs font-medium text-[color:var(--text-primary)]">
            {latest.description}
          </p>

          <p className="text-[10px] text-[color:var(--text-tertiary)] mt-1">
            {latest.change_type.replace(/_/g, ' ')}
          </p>
        </div>

        {/* Before / After / Delta */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
            <p className="text-[10px] uppercase tracking-widest text-[color:var(--text-tertiary)]">
              Before
            </p>

            <p className="text-lg font-semibold text-[color:var(--text-primary)] mt-1">
              {latest.health_before ?? '—'}
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
            <p className="text-[10px] uppercase tracking-widest text-[color:var(--text-tertiary)]">
              After
            </p>

            <p className="text-lg font-semibold text-[color:var(--text-primary)] mt-1">
              {latest.health_after ?? '—'}
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
            <p className="text-[10px] uppercase tracking-widest text-[color:var(--text-tertiary)]">
              Delta
            </p>

            <div className="mt-2">
              <Delta
                value={latest.health_delta}
                goodWhenUp
              />
            </div>
          </div>
        </div>

        {/* Affected Agents */}
        {latest.impact.agents.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-3.5 h-3.5 text-purple-400" />

              <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--text-secondary)]">
                Affected Agents
              </span>
            </div>

            <div className="space-y-1.5">
              {latest.impact.agents
                .slice(0, 5)
                .map(agent => (
                  <div
                    key={agent.agentId}
                    className="flex items-center justify-between rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-3 py-2"
                  >
                    <span className="text-xs text-[color:var(--text-primary)]">
                      {agent.agentName}
                    </span>

                    <Delta value={agent.delta} />
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Affected People */}
        {latest.impact.people.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-3.5 h-3.5 text-indigo-400" />

              <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--text-secondary)]">
                Affected People
              </span>
            </div>

            <div className="space-y-1.5">
              {latest.impact.people
                .slice(0, 5)
                .map(person => (
                  <div
                    key={person.employeeId}
                    className="flex items-center justify-between rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-3 py-2"
                  >
                    <span className="text-xs text-[color:var(--text-primary)]">
                      {person.name}
                    </span>

                    <Delta value={person.delta} />
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Affected Workflows */}
        {latest.impact.downstream.workflows.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <GitFork className="w-3.5 h-3.5 text-sky-400" />

              <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--text-secondary)]">
                Affected Workflows
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {latest.impact.downstream.workflows
                .slice(0, 8)
                .map(workflow => (
                  <span
                    key={workflow.id}
                    className="px-2.5 py-1 rounded-md bg-sky-500/10 border border-sky-500/20 text-[10px] text-sky-300"
                  >
                    {workflow.name}
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}