import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Overlay from "@/pages/overlay";
import Panel from "@/pages/panel";
import { useState, useRef, useCallback, useEffect } from "react";

function AppContent() {
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout>();
  const intentionalDisconnect = useRef(false);

  const connectWs = useCallback((user: string) => {
    intentionalDisconnect.current = false;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws?username=${user}&role=host`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "connect", payload: { username: user } }));
      setIsConnected(true);
      setUsername(user);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "battle_state") {
          setIsConnected(msg.payload.isConnected);
        } else if (msg.type === "error") {
          setIsConnected(false);
        }
      } catch {}
    };

    ws.onclose = () => {
      if (!intentionalDisconnect.current) {
        reconnectRef.current = setTimeout(() => connectWs(user), 3000);
      }
    };

    ws.onerror = () => ws.close();
  }, []);

  const handleConnect = useCallback((user: string) => {
    connectWs(user);
  }, [connectWs]);

  const handleDisconnect = useCallback(() => {
    intentionalDisconnect.current = true;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "disconnect" }));
    }
    wsRef.current?.close();
    wsRef.current = null;
    clearTimeout(reconnectRef.current);
    setIsConnected(false);
    setUsername("");
  }, []);

  useEffect(() => {
    return () => {
      intentionalDisconnect.current = true;
      wsRef.current?.close();
      clearTimeout(reconnectRef.current);
    };
  }, []);

  return (
    <Switch>
      <Route path="/">
        <Home
          isConnected={isConnected}
          username={username}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />
      </Route>
      <Route path="/overlay" component={Overlay} />
      <Route path="/panel" component={Panel} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
