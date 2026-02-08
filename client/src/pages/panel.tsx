import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Swords, Plus, Minus, RotateCcw, Wifi, WifiOff, Heart } from "lucide-react";
import type { BattleState } from "@shared/schema";

export default function Panel() {
  const [selectedMode, setSelectedMode] = useState<number>(5);
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
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws?username=${username}&role=panel`);
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
    if (document.getElementById("overlay-config-box")) return;

    const box = document.createElement("div");
    box.id = "overlay-config-box";
    box.style.cssText = `position:fixed;bottom:20px;right:20px;padding:12px;background:#111;color:white;border-radius:10px;z-index:9999;font-size:12px;display:flex;flex-direction:column;gap:8px;`;

    const savedColor = localStorage.getItem("heartColor") || "#ff0000";
    const savedLayout = localStorage.getItem("overlayLayout") || "horizontal";
    const savedTransparent = localStorage.getItem("overlayTransparent") === "true";

    box.innerHTML = `
      <strong>Overlay Config</strong>
      <label>Cor dos coracoes: <input type="color" id="heartColor" value="${savedColor}"></label>
      <label>Layout:
        <select id="layoutMode">
          <option value="horizontal" ${savedLayout === "horizontal" ? "selected" : ""}>Horizontal</option>
          <option value="vertical" ${savedLayout === "vertical" ? "selected" : ""}>Vertical</option>
          <option value="stacked" ${savedLayout === "stacked" ? "selected" : ""}>Empilhado</option>
        </select>
      </label>
      <label><input type="checkbox" id="transparentToggle" ${savedTransparent ? "checked" : ""}> Fundo transparente</label>
    `;

    document.body.appendChild(box);

    const fire = () => window.dispatchEvent(new Event("overlay-config"));

    box.querySelector("#heartColor")?.addEventListener("change", (e: any) => {
      localStorage.setItem("heartColor", e.target.value);
      fire();
    });

    box.querySelector("#layoutMode")?.addEventListener("change", (e: any) => {
      localStorage.setItem("overlayLayout", e.target.value);
      fire();
    });

    box.querySelector("#transparentToggle")?.addEventListener("change", (e: any) => {
      localStorage.setItem("overlayTransparent", e.target.checked ? "true" : "false");
      fire();
    });

    return () => {
      const el = document.getElementById("overlay-config-box");
      if (el) el.remove();
    };
  }, []);

  const sendCommand = (type: string, payload?: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  };

  const { participantA, participantB, isBattleActive, isConnected, roundWinner } = state;

  const renderParticipantControls = (participant: typeof participantA, side: "a" | "b") => {
    if (!participant) return null;
    const sideColor = side === "a" ? "text-blue-500" : "text-red-500";
    const sideBg = side === "a" ? "border-blue-500/30" : "border-red-500/30";

    return (
      <Card className={`p-4 space-y-3 border ${sideBg}`}>
        <div className="flex items-center gap-3">
          <img
            src={participant.profilePictureUrl}
            alt={participant.nickname}
            className="w-10 h-10 rounded-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm truncate ${sideColor}`}>{participant.nickname}</p>
            <p className="text-xs text-muted-foreground">@{participant.uniqueId}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-yellow-500 text-lg">&#9733;</span>
            <span className="font-bold text-lg" data-testid={`text-score-${side}`}>
              {participant.points.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Heart
                key={i}
                className={`w-4 h-4 ${i < participant.hearts ? "text-red-500 fill-red-500" : "text-muted-foreground/30"}`}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            data-testid={`button-add-heart-${side}`}
            size="sm"
            variant="outline"
            onClick={() => sendCommand("adjust_hearts", { side, delta: 1 })}
          >
            <Plus className="w-3 h-3 mr-1" />
            <Heart className="w-3 h-3" />
          </Button>
          <Button
            data-testid={`button-remove-heart-${side}`}
            size="sm"
            variant="outline"
            onClick={() => sendCommand("adjust_hearts", { side, delta: -1 })}
          >
            <Minus className="w-3 h-3 mr-1" />
            <Heart className="w-3 h-3" />
          </Button>
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Painel de Controle</h1>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Badge variant="default" className="bg-green-600 text-white border-green-700">
                <Wifi className="w-3 h-3 mr-1" />
                Conectado
              </Badge>
            ) : (
              <Badge variant="secondary">
                <WifiOff className="w-3 h-3 mr-1" />
                Desconectado
              </Badge>
            )}
            {isBattleActive && (
              <Badge variant="default">Batalha Ativa</Badge>
            )}
          </div>
        </div>

        {roundWinner && (
          <Card className="p-3 border-yellow-500/30">
            <div className="flex items-center gap-2">
              <span className="text-yellow-500">&#9733;</span>
              <span className="text-sm font-medium">
                Ultimo vencedor: <span className="font-bold">{roundWinner}</span>
              </span>
            </div>
          </Card>
        )}

        {isBattleActive && participantA && participantB ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {renderParticipantControls(participantA, "a")}
            {renderParticipantControls(participantB, "b")}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground text-sm">
              {isConnected
                ? "Aguardando inicio da batalha..."
                : "Conecte-se a uma live na pagina principal para comecar"}
            </p>
          </Card>
        )}

        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-medium">Modo de Batalha</h3>
          <p className="text-xs text-muted-foreground">Selecione antes de iniciar a batalha. Aplica na proxima batalha com novo oponente.</p>
          <div className="flex gap-2 flex-wrap">
            <Button
              data-testid="button-mode-bo3"
              variant={selectedMode === 2 ? "default" : "outline"}
              onClick={() => {
                setSelectedMode(2);
                sendCommand("set_battle_mode", { hearts: 2 });
                sendCommand("reset_hearts", { count: 2 });
              }}
            >
              <Heart className="w-4 h-4 mr-1" />
              Melhor de 3
            </Button>
            <Button
              data-testid="button-mode-bo5"
              variant={selectedMode === 3 ? "default" : "outline"}
              onClick={() => {
                setSelectedMode(3);
                sendCommand("set_battle_mode", { hearts: 3 });
                sendCommand("reset_hearts", { count: 3 });
              }}
            >
              <Heart className="w-4 h-4 mr-1" />
              Melhor de 5
            </Button>
            <Button
              data-testid="button-mode-default"
              variant={selectedMode === 5 ? "default" : "outline"}
              onClick={() => {
                setSelectedMode(5);
                sendCommand("set_battle_mode", { hearts: 5 });
                sendCommand("reset_hearts", { count: 5 });
              }}
            >
              <Heart className="w-4 h-4 mr-1" />
              Padrao (5)
            </Button>
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-medium">Controles Gerais</h3>
          <div className="flex gap-2 flex-wrap">
            <Button
              data-testid="button-reset-battle"
              variant="destructive"
              onClick={() => sendCommand("reset_battle")}
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Resetar Batalha
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Esses botoes ajustam apenas o overlay visual. Nao interferem nos eventos do TikTok.
          </p>
        </Card>
      </div>
    </div>
  );
}
