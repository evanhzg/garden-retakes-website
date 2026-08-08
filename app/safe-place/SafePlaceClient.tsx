"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ArrowRight, Heart, Sparkles, CheckCircle2 } from "lucide-react";
import styles from "./safe-place.module.css";

export default function SafePlaceClient({ loggedIn, hasAccess }: { loggedIn: boolean; hasAccess: boolean }) {
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
    exit: { y: -30, opacity: 0, scale: 0.8, rotateX: -90 }
  };

  const [wordIndex, setWordIndex] = useState(0);
  const words = ["Queen", "King"];
  
  useEffect(() => {
    if (hasAccess) {
      const interval = setInterval(() => {
        setWordIndex(prev => (prev + 1) % words.length);
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
      body: JSON.stringify({ DiscordId: discordId, Motivation: motivation, Gender: gender, AgreedToRules: rulesAccepted })
    });

    if (res.ok) {
      setSubmitted(true);
    } else {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  if (!mounted) {
    return (
      <div className={styles.container}>
        <div className={styles.content} style={{ opacity: 0 }}>
          {/* placeholder */}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <motion.div 
        className={styles.content}
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, type: "spring", bounce: 0.4 }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
        >
          <div style={{ position: "relative", display: "inline-block", marginBottom: "1.5rem" }}>
            <Shield size={56} color="var(--color-accent)" />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              style={{ position: "absolute", top: -8, right: -8 }}
            >
              <Sparkles size={24} color="var(--color-accent-2)" />
            </motion.div>
          </div>
        </motion.div>
        
        <motion.h1 
          className={styles.title}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          The Safe Queue
        </motion.h1>
        
        <motion.p 
          className={styles.description}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          A premium matchmaking experience built on respect and positivity. 
          We prioritize creating a harassment-free space for everyone, 
          where every player earns their place through kindness and teamplay.
        </motion.p>

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
                    onChange={e => setDiscordId(e.target.value)}
                  />
                </motion.div>

                <motion.div className={styles.inputGroup} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
                  <label className={styles.label}>Motivation</label>
                  <textarea 
                    className={styles.textarea} 
                    placeholder="Why do you want to join the Safe Queue?"
                    value={motivation}
                    onChange={e => setMotivation(e.target.value)}
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
                          onChange={e => setGender(e.target.value)} 
                        /> {g}
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
                      onChange={e => setRulesAccepted(e.target.checked)}
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
  );
}
