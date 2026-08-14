"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ArrowRight, Heart, Sparkles, CheckCircle2, ShieldCheck, ClipboardList, Clock3 } from "lucide-react";
import styles from "./safe-place.module.css";
import type { SafeStatusProps } from "./page";

const INFO_CARDS = [
  {
    icon: ShieldCheck,
    title: "What it is",
    body: "A second matchmaking pool, screened for players who actually want a chill, respectful game — no slurs, no throwing, no piling on. Same maps, same competitive rules, calmer lobby.",
  },
  {
    icon: ClipboardList,
    title: "How access works",
    body: null,
    list: [
      "Submit a request with a bit about why you want in",
      "A short probation while the team gets a read on you",
      "Full access once that goes well",
    ],
  },
  {
    icon: Heart,
    title: "The ground rules",
    body: null,
    list: [
      "No harassment, slurs, or targeted insults — ever",
      "Communicate like a teammate, not an opponent",
      "Report don't retaliate — mods handle the rest",
    ],
  },
];

const SCORE_ROWS: { key: keyof NonNullable<SafeStatusProps>; label: string }[] = [
  { key: "safeScore", label: "Overall standing" },
  { key: "teamplayScore", label: "Teamplay" },
  { key: "commScore", label: "Communication" },
  { key: "toxicityScore", label: "Low toxicity" },
];

function StatusBadge({ status }: { status: string }) {
  const cls = status === "ACTIVE" ? styles.active : status === "PROBING" ? styles.probing : "";
  const label = status === "ACTIVE" ? "Active member" : status === "PROBING" ? "On probation" : status;
  return <span className={`${styles.statusBadge} ${cls}`}>{label}</span>;
}

function ScoreBar({ label, value, delay }: { label: string; value: number; delay: number }) {
  return (
    <div className={styles.scoreRow}>
      <div className={styles.scoreLabel}>
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </div>
      <div className={styles.scoreTrack}>
        <motion.div
          className={styles.scoreFill}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
          transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

export default function SafePlaceClient({
  loggedIn,
  hasAccess,
  safeStatus,
  pendingRequest,
  memberCount,
}: {
  loggedIn: boolean;
  hasAccess: boolean;
  safeStatus: SafeStatusProps;
  pendingRequest: boolean;
  memberCount: number;
}) {
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [discordId, setDiscordId] = useState("");
  const [motivation, setMotivation] = useState("");
  const [gender, setGender] = useState("");
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const wordVariants = {
    initial: { y: 30, opacity: 0, scale: 0.5, rotateX: 90 },
    animate: { y: 0, opacity: 1, scale: 1.1, rotateX: 0 },
    exit: { y: -30, opacity: 0, scale: 0.8, rotateX: -90 },
  };

  const [wordIndex, setWordIndex] = useState(0);
  const words = ["Queen", "King"];

  useEffect(() => {
    if (hasAccess) {
      const interval = setInterval(() => {
        setWordIndex((prev) => (prev + 1) % words.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [hasAccess, words.length]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!discordId || !motivation || !gender || !rulesAccepted) {
      setError("Please fill out all fields and accept the rules.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/safe-queue/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ DiscordId: discordId, Motivation: motivation, Gender: gender, AgreedToRules: rulesAccepted }),
    });

    if (res.ok) {
      setSubmitted(true);
    } else {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  if (!mounted) {
    return <div className={styles.page} style={{ minHeight: "60vh" }} />;
  }

  const stagger = {
    animate: { transition: { staggerChildren: 0.08 } },
  };
  const fadeUp = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
  };

  return (
    <div className={styles.page}>
      <section className="hero">
        <div className="hero-inner">
          <span className="eyebrow">Community</span>
          <h1>
            The <span className="grad">Safe Queue</span>
          </h1>
          <p className="muted">
            A screened matchmaking pool built on respect and positivity. Every member earned their place through
            kindness and teamplay — not just a rank. It exists because &quot;just mute them&quot; isn&apos;t a game
            mode, and some nights you just want to play without bracing for it.
          </p>
        </div>
      </section>

      <div className={styles.container}>
        <div className={styles.memberPill}>
          <span className={styles.memberPillDot} />
          <span className={styles.memberPillCount}>{memberCount}</span> active member{memberCount === 1 ? "" : "s"}
        </div>

        <motion.div
          className={styles.infoGrid}
          initial="initial"
          animate="animate"
          variants={stagger}
        >
          {INFO_CARDS.map((card) => (
            <motion.div key={card.title} className={styles.infoCard} variants={fadeUp} transition={{ duration: 0.5 }}>
              <div className={styles.infoCardIcon}>
                <card.icon size={20} />
              </div>
              <h3>{card.title}</h3>
              {card.body ? <p>{card.body}</p> : <ul>{card.list!.map((l) => <li key={l}>{l}</li>)}</ul>}
            </motion.div>
          ))}
        </motion.div>

        {loggedIn && safeStatus && (
          <motion.div
            className={styles.standingPanel}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className={styles.standingHead}>
              <h2>Your standing</h2>
              <StatusBadge status={safeStatus.status} />
            </div>
            {SCORE_ROWS.map((row, i) => (
              <ScoreBar key={row.key} label={row.label} value={safeStatus[row.key] as number} delay={0.1 + i * 0.08} />
            ))}
          </motion.div>
        )}

        <motion.div
          className={styles.content}
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, type: "spring", bounce: 0.35, delay: 0.15 }}
        >
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 15 }}
          >
            <div style={{ position: "relative", display: "inline-block", marginBottom: "1.25rem" }}>
              <Shield size={48} color="var(--color-accent)" />
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                style={{ position: "absolute", top: -8, right: -8 }}
              >
                <Sparkles size={20} color="var(--color-accent-2)" />
              </motion.div>
            </div>
          </motion.div>

          <AnimatePresence mode="wait">
            {hasAccess ? (
              <motion.div
                key="access"
                className={styles.accessGranted}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <CheckCircle2 size={32} color="#10b981" style={{ margin: "0 auto 12px", display: "block" }} />
                You already have access to the queue,{" "}
                <span className={styles.loopText}>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={wordIndex}
                      variants={wordVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={{ duration: 0.5, type: "spring" }}
                      style={{ position: "absolute", left: 0 }}
                    >
                      {words[wordIndex]}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </motion.div>
            ) : !loggedIn ? (
              <motion.a
                key="login"
                href="/api/auth/steam/login"
                className={styles.button}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                Connect with Steam <ArrowRight size={20} />
              </motion.a>
            ) : pendingRequest ? (
              <motion.div
                key="pending"
                className={styles.pendingBanner}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <Clock3 size={20} />
                Your request is in review — we&apos;ll let you know.
              </motion.div>
            ) : submitted ? (
              <motion.div
                key="submitted"
                className={styles.successMessage}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring" }}
              >
                <Heart size={40} color="#10b981" style={{ marginBottom: "16px" }} />
                <span style={{ fontSize: "1.25rem", color: "var(--color-text)" }}>Your request has been submitted!</span>
                <span style={{ color: "var(--muted)", fontSize: "0.95rem", marginTop: "8px" }}>We will review it shortly.</span>
              </motion.div>
            ) : !showForm ? (
              <motion.button
                key="request-btn"
                className={styles.button}
                onClick={() => setShowForm(true)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Request Access <ArrowRight size={20} />
              </motion.button>
            ) : (
              <motion.div
                key="form"
                className={styles.formContainer}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4, type: "spring", bounce: 0 }}
              >
                <form onSubmit={handleSubmit}>
                  <motion.div className={styles.inputGroup} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
                    <label className={styles.label}>Discord ID</label>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="e.g. username#1234 or username"
                      value={discordId}
                      onChange={(e) => setDiscordId(e.target.value)}
                    />
                  </motion.div>

                  <motion.div className={styles.inputGroup} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
                    <label className={styles.label}>Motivation</label>
                    <textarea
                      className={styles.textarea}
                      placeholder="Why do you want to join the Safe Queue?"
                      value={motivation}
                      onChange={(e) => setMotivation(e.target.value)}
                    />
                  </motion.div>

                  <motion.div className={styles.inputGroup} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
                    <label className={styles.label}>Gender</label>
                    <div className={styles.checkboxGroup}>
                      {["Woman", "Man", "Other"].map((g) => (
                        <label key={g} className={styles.checkboxLabel}>
                          <input
                            type="radio"
                            name="gender"
                            value={g}
                            className={styles.checkboxInput}
                            onChange={(e) => setGender(e.target.value)}
                          />{" "}
                          {g}
                        </label>
                      ))}
                    </div>
                  </motion.div>

                  <motion.div className={styles.rulesBox} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.4 }}>
                    <label className={styles.checkboxLabel} style={{ alignItems: "flex-start" }}>
                      <input
                        type="checkbox"
                        className={styles.checkboxInput}
                        checked={rulesAccepted}
                        onChange={(e) => setRulesAccepted(e.target.checked)}
                        style={{ marginTop: "4px" }}
                      />
                      <span>
                        <strong>I agree to the strict rules:</strong> I will be respectful, communicative, and maintain a harassment-free environment.
                      </span>
                    </label>
                  </motion.div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ color: "#ef4444", marginBottom: "16px", fontWeight: 500 }}
                      >
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.button
                    type="submit"
                    className={styles.button}
                    disabled={loading}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    whileHover={{ scale: loading ? 1 : 1.02 }}
                    whileTap={{ scale: loading ? 1 : 0.98 }}
                  >
                    {loading ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                        <Shield size={20} />
                      </motion.div>
                    ) : (
                      "Submit Request"
                    )}
                  </motion.button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
