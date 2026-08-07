"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ArrowRight, Heart } from "lucide-react";
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
    initial: { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -20, opacity: 0 }
  };

  const [wordIndex, setWordIndex] = useState(0);
  const words = ["Queen", "King"];
  
  // Toggle the words every 2 seconds if they have access
  useState(() => {
    if (hasAccess) {
      const interval = setInterval(() => {
        setWordIndex(prev => (prev + 1) % words.length);
      }, 2000);
      return () => clearInterval(interval);
    }
  });

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
      body: JSON.stringify({ discordId, motivation, gender, rulesAccepted })
    });

    if (res.ok) {
      setSubmitted(true);
    } else {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className={styles.container}>
      <motion.div 
        className={styles.content}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
        >
          <Shield size={48} color="#ff758c" style={{ marginBottom: 16 }} />
        </motion.div>
        
        <h1 className={styles.title}>The Safe Queue</h1>
        <p className={styles.description}>
          A premium matchmaking experience built on respect and positivity. 
          We prioritize creating a harassment-free space for women and minorities, 
          where every player earns their place through kindness and teamplay.
        </p>

        {hasAccess ? (
          <div style={{ fontSize: "1.25rem", fontWeight: 600, color: "#5a6a7c" }}>
            You already have access to the queue,{" "}
            <span className={styles.loopText}>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={wordIndex}
                  variants={wordVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.5 }}
                  style={{ position: "absolute", left: 0, background: "linear-gradient(90deg, #ff758c 0%, #ff7eb3 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                >
                  {words[wordIndex]}
                </motion.span>
              </AnimatePresence>
            </span>
          </div>
        ) : !loggedIn ? (
          <a href="/api/auth/steam/login" className={styles.button}>
            Connect with Steam <ArrowRight size={20} />
          </a>
        ) : submitted ? (
          <motion.div 
            className={styles.successMessage}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Heart size={32} style={{ margin: "0 auto 12px" }} />
            Your request has been submitted! We will review it shortly.
          </motion.div>
        ) : !showForm ? (
          <button className={styles.button} onClick={() => setShowForm(true)}>
            Request Access <ArrowRight size={20} />
          </button>
        ) : (
          <motion.div 
            className={styles.formContainer}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
          >
            <form onSubmit={handleSubmit}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Discord ID</label>
                <input 
                  type="text" 
                  className={styles.input} 
                  placeholder="e.g. username#1234 or username"
                  value={discordId}
                  onChange={e => setDiscordId(e.target.value)}
                />
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label}>Motivation</label>
                <textarea 
                  className={styles.textarea} 
                  placeholder="Why do you want to join the Safe Queue?"
                  value={motivation}
                  onChange={e => setMotivation(e.target.value)}
                />
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label}>Gender</label>
                <div className={styles.checkboxGroup}>
                  <label className={styles.checkboxLabel}>
                    <input type="radio" name="gender" value="Woman" onChange={e => setGender(e.target.value)} /> Woman
                  </label>
                  <label className={styles.checkboxLabel}>
                    <input type="radio" name="gender" value="Man" onChange={e => setGender(e.target.value)} /> Man
                  </label>
                  <label className={styles.checkboxLabel}>
                    <input type="radio" name="gender" value="Other" onChange={e => setGender(e.target.value)} /> Other
                  </label>
                </div>
              </div>

              <div className={styles.rulesBox}>
                <label className={styles.checkboxLabel}>
                  <input 
                    type="checkbox" 
                    checked={rulesAccepted}
                    onChange={e => setRulesAccepted(e.target.checked)}
                  />
                  <span>
                    <strong>I agree to the strict rules:</strong> I will be respectful, communicative, and maintain a harassment-free environment.
                  </span>
                </label>
              </div>

              {error && <div style={{ color: "#e74c3c", marginBottom: 16 }}>{error}</div>}

              <button type="submit" className={styles.button} style={{ width: "100%", justifyContent: "center" }} disabled={loading}>
                {loading ? "Submitting..." : "Submit Request"}
              </button>
            </form>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
