"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const BACKGROUNDS = [
  { id: "green", url: "/backgrounds/passport_bg_green.jpg", label: "Green Landscape" },
  { id: "blue", url: "/backgrounds/passport_bg_blue.jpg", label: "Blue Peaks" },
  { id: "purple", url: "/backgrounds/passport_bg_purple.jpg", label: "Purple Valley" },
  { id: "orange", url: "/backgrounds/passport_bg_orange.jpg", label: "Sunset Horizon" },
];

const ROLES = ["Entry Fragger", "AWPer", "Support", "Lurker", "IGL", "Flex"];

export default function PassportWorkflow({ session }: { session: any }) {
  const [passportData, setPassportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0); // 0: Form, 1: Background, 2: Generated Passport
  
  const [formData, setFormData] = useState({
    username: session?.name || "",
    role: "",
    age: "",
    country: "",
    backgroundId: BACKGROUNDS[0].id
  });

  useEffect(() => {
    if (!session?.authenticated) {
      setLoading(false);
      return;
    }
    
    fetch("/api/passport")
      .then(r => r.json())
      .then(data => {
        if (data.exists) {
          setPassportData(data);
          setStep(2);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [session]);

  if (!session?.authenticated || loading) return null;
  
  // If we have passportData but step isn't 2, force it.
  // We only show the modal if they DON'T have a passport (step 0,1) 
  // OR if we want to show it as a profile (for this prompt, let's say it hides if they already have one, or shows it? "until the user has a passport"). 
  // Wait, if they have one, do we hide the modal? "until the user has a passport". So we hide it if they have one.
  if (step === 2 && passportData) return null;

  const handleSubmit = async () => {
    if (step === 0) {
      if (!formData.username || !formData.role || !formData.age || !formData.country) return;
      setStep(1);
      return;
    }
    
    if (step === 1) {
      setLoading(true);
      await fetch("/api/passport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const data = await fetch("/api/passport").then(r => r.json());
      setPassportData(data);
      setStep(2);
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (step === 2) setStep(3); // Hide it
  };

  if (step === 3) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999999,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)"
    }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          style={{
            background: "var(--color-background-elevated, #111)",
            border: "1px solid var(--color-divider)",
            borderRadius: "12px",
            width: "90%",
            maxWidth: step === 2 ? "450px" : "500px",
            overflow: "hidden",
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column"
          }}
        >
          {step === 0 && (
            <div style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
              <div>
                <h2 style={{ margin: "0 0 8px 0", fontSize: "24px", fontWeight: "bold" }}>Create Your Passport</h2>
                <p style={{ margin: 0, color: "var(--color-text-muted)" }}>Fill out your details to join the matchmaking network.</p>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "bold" }}>Username</label>
                  <input 
                    type="text" 
                    value={formData.username}
                    onChange={e => setFormData({...formData, username: e.target.value})}
                    style={{ width: "100%", padding: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--color-divider)", borderRadius: "6px", color: "var(--color-text)" }}
                  />
                </div>
                
                <div>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "bold" }}>Role</label>
                  <select 
                    value={formData.role}
                    onChange={e => setFormData({...formData, role: e.target.value})}
                    style={{ width: "100%", padding: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--color-divider)", borderRadius: "6px", color: "var(--color-text)" }}
                  >
                    <option value="" disabled>Select your role</option>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>

                <div style={{ display: "flex", gap: "16px" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "bold" }}>Age</label>
                    <input 
                      type="number" 
                      min="13" max="99"
                      value={formData.age}
                      onChange={e => setFormData({...formData, age: e.target.value})}
                      style={{ width: "100%", padding: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--color-divider)", borderRadius: "6px", color: "var(--color-text)" }}
                    />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "bold" }}>Country (Code)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. FR, US, DE"
                      maxLength={2}
                      value={formData.country}
                      onChange={e => setFormData({...formData, country: e.target.value.toUpperCase()})}
                      style={{ width: "100%", padding: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--color-divider)", borderRadius: "6px", color: "var(--color-text)" }}
                    />
                  </div>
                </div>
              </div>

              <button 
                onClick={handleSubmit}
                disabled={!formData.username || !formData.role || !formData.age || !formData.country}
                style={{
                  padding: "12px",
                  background: "var(--color-accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  marginTop: "8px",
                  opacity: (!formData.username || !formData.role || !formData.age || !formData.country) ? 0.5 : 1
                }}>
                Next
              </button>
            </div>
          )}

          {step === 1 && (
            <div style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
              <div>
                <h2 style={{ margin: "0 0 8px 0", fontSize: "24px", fontWeight: "bold" }}>Choose Your Background</h2>
                <p style={{ margin: 0, color: "var(--color-text-muted)" }}>This will be the top half of your passport.</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {BACKGROUNDS.map(bg => (
                  <div 
                    key={bg.id}
                    onClick={() => setFormData({...formData, backgroundId: bg.id})}
                    style={{
                      cursor: "pointer",
                      border: formData.backgroundId === bg.id ? "2px solid var(--color-accent)" : "2px solid transparent",
                      borderRadius: "8px",
                      overflow: "hidden",
                      transition: "all 0.2s"
                    }}
                  >
                    <img src={bg.url} alt={bg.label} style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }} />
                    <div style={{ padding: "8px", background: "rgba(255,255,255,0.05)", textAlign: "center", fontSize: "12px" }}>
                      {bg.label}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                <button 
                  onClick={() => setStep(0)}
                  style={{
                    flex: 1, padding: "12px", background: "rgba(255,255,255,0.1)", color: "#fff",
                    border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer"
                  }}>
                  Back
                </button>
                <button 
                  onClick={handleSubmit}
                  style={{
                    flex: 2, padding: "12px", background: "var(--color-accent)", color: "#fff",
                    border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer"
                  }}>
                  Mint Passport
                </button>
              </div>
            </div>
          )}

          {step === 2 && passportData && (
            <div style={{ position: "relative" }}>
              {/* Background Top Half */}
              <div style={{ 
                height: "200px", 
                width: "100%",
                backgroundImage: `url(${BACKGROUNDS.find(b => b.id === passportData.passport.backgroundId)?.url})`,
                backgroundSize: "cover",
                backgroundPosition: "center"
              }} />
              
              {/* Profile Picture */}
              <div style={{ 
                position: "absolute",
                top: "150px", left: "24px",
                width: "100px", height: "100px",
                borderRadius: "12px",
                border: "4px solid var(--color-background-elevated, #111)",
                backgroundImage: `url(${session.avatar})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat"
              }} />

              {/* Passport Content */}
              <div style={{ padding: "64px 24px 24px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h2 style={{ margin: "0", fontSize: "24px", fontWeight: "bold" }}>{passportData.passport.username}</h2>
                    <p style={{ margin: "4px 0 0 0", color: "var(--color-text-muted)" }}>
                      {passportData.passport.role} • {passportData.passport.age} Y/O • {passportData.passport.country}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "12px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Rating</div>
                    <div style={{ fontSize: "24px", fontWeight: "bold", color: "var(--color-accent)" }}>
                      {passportData.stats.rating}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "8px" }}>
                  <div style={{ background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: "8px" }}>
                    <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>2v2 Winrate</div>
                    <div style={{ fontSize: "18px", fontWeight: "bold" }}>{passportData.stats.winrate2v2}%</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: "8px" }}>
                    <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>3v3 Winrate</div>
                    <div style={{ fontSize: "18px", fontWeight: "bold" }}>{passportData.stats.winrate3v3}%</div>
                  </div>
                </div>

                <div style={{ background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Best Teammate</div>
                  <div style={{ fontSize: "14px", fontWeight: "bold" }}>{passportData.stats.bestTeammate}</div>
                </div>

                <button 
                  onClick={handleClose}
                  style={{
                    width: "100%", padding: "12px", background: "var(--color-accent)", color: "#fff",
                    border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer", marginTop: "16px"
                  }}>
                  Continue
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
