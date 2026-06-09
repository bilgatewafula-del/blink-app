import React, { useState } from "react";
import BLinkAIChat from "./BLinkAIChat";

const BLinkAIButton = () => {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);

  return (
    <>
      {/* FLOATING BUTTON */}
      <div
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
        }}
      >
        {/* NAME (ONLY ON HOVER) */}
        {hover && (
          <div
            style={{
              background: "#111827",
              color: "white",
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: 12,
              whiteSpace: "nowrap",
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            }}
          >
            B-Link AI
          </div>
        )}

        {/* BUTTON */}
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
            fontWeight: "bold",
            color: "white",
            background: "linear-gradient(135deg, #2563eb, #7c3aed, #06b6d4)",
            boxShadow: "0 0 18px rgba(37,99,235,0.6)",
            animation: "pulseGlow 2s infinite",
          }}
        >
          B
        </div>
      </div>

      {/* CHAT */}
      {open && <BLinkAIChat onClose={() => setOpen(false)} />}

      {/* GLOW ANIMATION */}
      <style>
        {`
          @keyframes pulseGlow {
            0% { box-shadow: 0 0 10px rgba(37,99,235,0.4); }
            50% { box-shadow: 0 0 20px rgba(124,58,237,0.8); }
            100% { box-shadow: 0 0 10px rgba(37,99,235,0.4); }
          }
        `}
      </style>
    </>
  );
};

export default BLinkAIButton;