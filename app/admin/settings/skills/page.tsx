"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SettingsField,
  settingsInputStyle,
  settingsRequest,
} from "@/components/admin/SettingsForm";
import styles from "@/components/admin/SettingsForm.module.css";
import local from "./skills.module.css";
import {
  availableSkillInstallGroups,
  groupSkillInstallResults,
  skillInstallGroup,
  skillInstallError,
  type SkillInstallInput,
  type SkillInstallJob,
} from "@/lib/skills";
import type { Runner } from "../settings-data";

function availableAgents(runner: Runner) {
  return availableSkillInstallGroups(runner.agents);
}

export default function SkillsPage() {
  const router = useRouter();
  const [runners, setRunners] = useState<Runner[]>([]);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [source, setSource] = useState("");
  const [skill, setSkill] = useState("");
  const [replace, setReplace] = useState(false);
  const [jobs, setJobs] = useState<SkillInstallJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    setError("");
    try {
      const [nextRunners, nextJobs] = await Promise.all([
        settingsRequest<Runner[]>("/api/runners"),
        settingsRequest<SkillInstallJob[]>("/api/skills/install"),
      ]);
      setRunners(nextRunners);
      setJobs(nextJobs);
      const defaultRunner = nextRunners.find(
        (runner) =>
          runner.connected &&
          runner.capabilities?.includes("skills.install") &&
          availableAgents(runner).length,
      );
      setSelected((previous) =>
        Object.fromEntries(
          nextRunners.map((runner) => [
            runner.id,
            runner.connected && runner.capabilities?.includes("skills.install")
              ? (
                  previous[runner.id] ??
                  (Object.keys(previous).length === 0 &&
                  runner.id === defaultRunner?.id
                    ? availableAgents(runner).map((agent) => agent.id)
                    : [])
                ).filter((id) =>
                  availableAgents(runner).some((agent) => agent.id === id),
                )
              : [],
          ]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);
  const running = jobs.some((job) =>
    job.results.some((result) => result.status === "running"),
  );
  useEffect(() => {
    if (!running) return;
    let disposed = false;
    const timer = setInterval(() => {
      void settingsRequest<SkillInstallJob[]>("/api/skills/install")
        .then((value) => {
          if (!disposed) setJobs(value);
        })
        .catch((err) => {
          if (!disposed) setError(err.message);
        });
    }, 1500);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [running]);

  const targets = runners.flatMap((runner) => {
    const agents = availableAgents(runner)
      .filter((group) => selected[runner.id]?.includes(group.id))
      .map((group) => group.agent);
    return agents.length ? [{ runnerId: runner.id, agents }] : [];
  });
  const targetCount = targets.reduce(
    (total, target) => total + target.agents.length,
    0,
  );

  async function install() {
    const input: SkillInstallInput = {
      source: source.trim(),
      skill: skill.trim(),
      replace,
      targets,
    };
    const validation = skillInstallError(input);
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      const job = await settingsRequest<SkillInstallJob>(
        "/api/skills/install",
        "POST",
        input,
      );
      setJobs((previous) => [job, ...previous]);
      setNotice(
        "Installation started. Results are saved here, so you can leave and return later.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function selectFailed(job: SkillInstallJob) {
    setSource(job.source);
    setSkill(job.skill);
    setReplace(job.replace);
    setSelected(
      Object.fromEntries(
        runners.map((runner) => [
          runner.id,
          job.results
            .filter(
              (result) =>
                result.runnerId === runner.id &&
                result.status === "failed" &&
                runner.connected &&
                runner.capabilities?.includes("skills.install") &&
                availableAgents(runner).some(
                  (agent) => agent.id === skillInstallGroup(result.agent)?.id,
                ),
            )
            .map(
              (result) => skillInstallGroup(result.agent)?.id ?? result.agent,
            ),
        ]),
      ),
    );
    setNotice(
      "Failed targets selected. If a previous attempt wrote the skill, enable Replace existing skill before installing again.",
    );
    window.scrollTo({ top: 0 });
    document.getElementById("skill-source")?.focus();
  }

  return (
    <>
      <section className={styles.section}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void install();
          }}
        >
          <fieldset className={styles.content} disabled={loading || submitting}>
            <SettingsField label="Skill source">
              <input
                id="skill-source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="owner/repo, Git URL, or /absolute/path/on/runner"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                required
                style={settingsInputStyle}
              />
            </SettingsField>
            <SettingsField label="Skill name">
              <input
                value={skill}
                onChange={(event) => setSkill(event.target.value)}
                placeholder="The name in SKILL.md, e.g. opendesign"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                required
                style={settingsInputStyle}
              />
            </SettingsField>
            <p className={local.hint}>
              Installs for the runner&apos;s user across all projects. Local
              paths refer to the selected runner. Each runner needs Node.js
              22.20+, npm, and npx; Git sources also need Git.
            </p>
            <h2>Runners &amp; agents</h2>
            <p className={local.hint}>
              Choose agents below to include additional runners. Codex,
              OpenCode, and Pi share one installation in{" "}
              <code>~/.agents/skills</code>.
            </p>
            <button type="button" onClick={() => void refresh()}>
              Refresh runners
            </button>
            {!loading && !runners.length && (
              <p>No runners registered. Connect a runner to install skills.</p>
            )}
            <div className={local.runners}>
              {runners.map((runner) => {
                const agents = availableAgents(runner);
                const supported =
                  runner.capabilities?.includes("skills.install");
                const busy = jobs.some((job) =>
                  job.results.some(
                    (result) =>
                      result.runnerId === runner.id &&
                      result.status === "running",
                  ),
                );
                const disabled = !runner.connected || !supported || busy;
                return (
                  <fieldset
                    key={runner.id}
                    disabled={disabled}
                    className={local.runner}
                  >
                    <legend>
                      {runner.name}{" "}
                      <span className={local.hint}>({runner.hostname})</span>
                    </legend>
                    <p className={local.hint}>
                      {!runner.connected
                        ? "Disconnected"
                        : !supported
                          ? "Update and restart this runner to enable skill installation."
                          : busy
                            ? "Installation in progress…"
                            : !agents.length
                              ? "No supported agents detected."
                              : "Connected"}
                    </p>
                    {agents.length > 0 && (
                      <label className={local.option}>
                        <input
                          type="checkbox"
                          checked={agents.every((agent) =>
                            selected[runner.id]?.includes(agent.id),
                          )}
                          onChange={(event) =>
                            setSelected((previous) => ({
                              ...previous,
                              [runner.id]: event.target.checked
                                ? agents.map((agent) => agent.id)
                                : [],
                            }))
                          }
                        />
                        All agents on {runner.name}
                      </label>
                    )}
                    <div className={local.agents}>
                      {agents.map((agent) => (
                        <label key={agent.id} className={local.option}>
                          <input
                            type="checkbox"
                            checked={
                              selected[runner.id]?.includes(agent.id) ?? false
                            }
                            onChange={(event) =>
                              setSelected((previous) => ({
                                ...previous,
                                [runner.id]: event.target.checked
                                  ? [...(previous[runner.id] ?? []), agent.id]
                                  : (previous[runner.id] ?? []).filter(
                                      (id) => id !== agent.id,
                                    ),
                              }))
                            }
                          />
                          {agent.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <label className={local.option}>
              <input
                type="checkbox"
                checked={replace}
                onChange={(event) => setReplace(event.target.checked)}
              />
              Replace existing skill
            </label>
            <p className={local.hint}>
              Existing installations are skipped unless replacement is enabled.
              Replacement updates the shared copy and any agent links to it.
            </p>
            <div className={styles.actions}>
              <button
                type="submit"
                disabled={!targetCount || running}
                className={local.install}
              >
                {submitting
                  ? "Starting…"
                  : `Install to ${targetCount} location${targetCount === 1 ? "" : "s"}`}
              </button>
              <button
                type="button"
                onClick={() => router.push("/admin/settings")}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
        {loading && <p role="status">Loading…</p>}
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" style={{ color: "var(--error)" }}>
            {error}
          </p>
        )}
      </section>
      <section className={styles.section} aria-label="Installation history">
        <h2>Installation history</h2>
        {!jobs.length && <p>No installations yet.</p>}
        {jobs.map((job) => (
          <article key={job.id} className={local.job}>
            <h3>{job.skill}</h3>
            <p className={local.source}>{job.source}</p>
            <p className={local.hint}>
              {new Date(job.createdAt).toLocaleString()}
            </p>
            <ul className={local.results}>
              {groupSkillInstallResults(job.results).map((result) => (
                <li key={`${result.runnerId}:${result.agent}`}>
                  <div className={local.result}>
                    <span>
                      {result.runnerName} ·{" "}
                      {skillInstallGroup(result.agent)?.name ?? result.agent}
                    </span>
                    <strong
                      className={
                        result.status === "failed"
                          ? local.failed
                          : result.status === "success"
                            ? local.success
                            : result.status === "skipped"
                              ? local.hint
                              : ""
                      }
                    >
                      {result.status === "running"
                        ? "Installing…"
                        : result.status === "success"
                          ? "Installed"
                          : result.status === "skipped"
                            ? "Skipped"
                            : "Failed"}
                    </strong>
                  </div>
                  {result.output && (
                    <details>
                      <summary>Installation log</summary>
                      <pre className={local.log}>{result.output}</pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
            {job.results.some((result) => result.status === "failed") && (
              <button
                type="button"
                disabled={running || submitting}
                onClick={() => selectFailed(job)}
              >
                Select failed targets
              </button>
            )}
          </article>
        ))}
      </section>
    </>
  );
}
