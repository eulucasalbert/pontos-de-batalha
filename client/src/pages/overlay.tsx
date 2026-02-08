import { useEffect, useState, useRef } from "react";
import type { BattleState } from "@shared/schema";

export default function Overlay() {
  const [state, setState] = useState<BattleState>({
    isConnected: false,
    isBattleActive: false,
    participantA: null,
    participantB: null,
    roundWinner: null,
    username: "",
  });
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const username = params.get("username")?.replace("@", "") || "";
    if (!username) return;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws?username=${username}&role=overlay`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "battle_state") {
            setState(msg.payload);
          }
        } catch {}
      };

      ws.onclose = () => {
        reconnectRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      wsRef.current?.close();
      clearTimeout(reconnectRef.current);
    };
  }, []);

  useEffect(() => {
    const applyConfig = () => {
      const overlay = document.getElementById("overlay");
      if (!overlay) return;

      const layout = localStorage.getItem("overlayLayout") || "horizontal";
      overlay.classList.remove("layout-horizontal","layout-vertical","layout-stacked");
      overlay.classList.add("layout-" + layout);

      const transparent = localStorage.getItem("overlayTransparent") === "true";
      if (transparent) {
        document.body.classList.add("overlay-transparent");
      } else {
        document.body.classList.remove("overlay-transparent");
      }

      const color = localStorage.getItem("heartColor") || "#ff0000";
      document.documentElement.style.setProperty("--heart-color", color);

      const leftBox = document.querySelector(".participant.left");
      const rightBox = document.querySelector(".participant.right");
      const leftHearts = document.getElementById("coracoesA");
      const rightHearts = document.getElementById("coracoesB");

      if (leftBox && leftHearts) {
        const activeCount = leftHearts.querySelectorAll(".heart-active").length;
        if (activeCount === 0) {
          leftBox.classList.add("defeated");
        } else {
          leftBox.classList.remove("defeated");
        }
      }

      if (rightBox && rightHearts) {
        const activeCount = rightHearts.querySelectorAll(".heart-active").length;
        if (activeCount === 0) {
          rightBox.classList.add("defeated");
        } else {
          rightBox.classList.remove("defeated");
        }
      }
    };

    applyConfig();
    window.addEventListener("overlay-config", applyConfig);
    const timer = setInterval(applyConfig, 1500);
    return () => {
      window.removeEventListener("overlay-config", applyConfig);
      clearInterval(timer);
    };
  }, []);

  const { participantA, participantB, isBattleActive } = state;

  if (!isBattleActive || !participantA || !participantB) {
    return (
      <div className="overlay-root">
        <style>{overlayStyles}</style>
      </div>
    );
  }

  const renderHearts = (count: number) => {
    const hearts = [];
    for (let i = 0; i < count; i++) {
      hearts.push(
        <svg
          key={i}
          className="heart-icon heart-active"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    }
    return hearts;
  };

  const proxyUrl = (url: string) => {
    if (!url) return "";
    return `/api/avatar-proxy?url=${encodeURIComponent(url)}`;
  };

  const fallbackA = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='white' font-size='30'%3EA%3C/text%3E%3C/svg%3E";
  const fallbackB = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='white' font-size='30'%3EB%3C/text%3E%3C/svg%3E";

  const avatarA = participantA.profilePictureUrl ? proxyUrl(participantA.profilePictureUrl) : fallbackA;
  const avatarB = participantB.profilePictureUrl ? proxyUrl(participantB.profilePictureUrl) : fallbackB;

  return (
    <div className="overlay-root">
      <div id="overlay">
        <div className="part side-a participant left">
          <img
            src={avatarA}
            alt={participantA.nickname}
            className="avatar"
            onError={(e) => { (e.target as HTMLImageElement).src = fallbackA; }}
          />
          <div className="info">
            <div className="name" data-testid="text-name-a">{participantA.nickname}</div>
            <div className="hearts-row" id="coracoesA">
              {renderHearts(participantA.hearts)}
            </div>
            <div className="score" data-testid="text-score-a">
              {participantA.points.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="vs-divider">
          <span className="vs-text">VS</span>
        </div>

        <div className="part side-b participant right">
          <div className="info info-right">
            <div className="name" data-testid="text-name-b">{participantB.nickname}</div>
            <div className="hearts-row hearts-right" id="coracoesB">
              {renderHearts(participantB.hearts)}
            </div>
            <div className="score" data-testid="text-score-b">
              {participantB.points.toLocaleString()}
            </div>
          </div>
          <img
            src={avatarB}
            alt={participantB.nickname}
            className="avatar"
            onError={(e) => { (e.target as HTMLImageElement).src = fallbackB; }}
          />
        </div>
      </div>
      <style>{overlayStyles}</style>
    </div>
  );
}

const overlayStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body, html {
    background: transparent !important;
    overflow: hidden;
  }

  .overlay-root {
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 20px;
    font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
  }

  #overlay {
    background: rgba(0, 0, 0, 0.85);
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px 20px;
    gap: 14px;
    color: white;
    position: relative;
  }

  .part {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  #overlay.layout-horizontal .info {
    align-items: flex-start;
  }

  #overlay.layout-horizontal .info-right {
    align-items: flex-end;
  }

  .side-a {
    flex-direction: row;
  }

  .side-b {
    flex-direction: row-reverse;
  }

  #overlay.layout-horizontal .side-b {
    flex-direction: row;
  }

  .avatar {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    border: 3px solid rgba(255, 255, 255, 0.3);
    background: #333;
    object-fit: cover;
    flex-shrink: 0;
  }

  .side-a .avatar {
    border-color: rgba(59, 130, 246, 0.7);
  }

  .side-b .avatar {
    border-color: rgba(239, 68, 68, 0.7);
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .info-right {
    text-align: right;
    align-items: flex-end;
  }

  .name {
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.1;
  }

  .hearts-row {
    display: flex;
    gap: 3px;
    justify-content: flex-start;
  }

  .hearts-right {
    justify-content: flex-end;
  }

  .heart-icon {
    width: 14px;
    height: 14px;
    transition: all 0.3s ease;
  }

  .heart-active {
    color: var(--heart-color, #ef4444);
    filter: drop-shadow(0 0 3px rgba(239, 68, 68, 0.5));
  }

  .score {
    font-size: 28px;
    font-weight: 900;
    color: #fff;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .vs-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 0 4px;
  }

  .vs-text {
    background: linear-gradient(135deg, #ff3b5c, #ff6b3b);
    color: #fff;
    font-size: 16px;
    font-weight: 900;
    padding: 8px 14px;
    border-radius: 12px;
    letter-spacing: 2px;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }

  .participant.defeated {
    opacity: 0.4;
    filter: grayscale(80%);
    transition: opacity 0.5s, filter 0.5s;
  }

  body.overlay-transparent #overlay {
    background: transparent !important;
  }

  #overlay.layout-horizontal {
    flex-direction: row;
  }

  #overlay.layout-vertical {
    flex-direction: column;
    width: 400px;
    height: auto;
    min-height: 300px;
    gap: 10px;
    padding: 20px;
  }

  #overlay.layout-vertical .part {
    width: 100%;
    justify-content: center;
  }

  #overlay.layout-vertical .vs-divider {
    width: 100%;
    justify-content: center;
  }

  #overlay.layout-stacked {
    flex-direction: column;
    width: 300px;
    height: auto;
    min-height: 320px;
    gap: 8px;
    padding: 16px;
    align-items: center;
  }

  #overlay.layout-stacked .part {
    flex-direction: column;
    text-align: center;
    width: 100%;
    justify-content: center;
  }

  #overlay.layout-stacked .info,
  #overlay.layout-stacked .info-right {
    text-align: center;
    align-items: center;
  }

  #overlay.layout-stacked .hearts-row,
  #overlay.layout-stacked .hearts-right {
    justify-content: center;
  }
`;
