import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, Swords, Copy, Check, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface HomeProps {
  isConnected: boolean;
  username: string;
  onConnect: (username: string) => void;
  onDisconnect: () => void;
}

export default function Home({ isConnected, username, onConnect, onDisconnect }: HomeProps) {
  const [inputUsername, setInputUsername] = useState("");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleConnect = () => {
    const clean = inputUsername.replace("@", "").trim();
    if (!clean) {
      toast({ title: "Erro", description: "Digite o @username do criador da live", variant: "destructive" });
      return;
    }
    onConnect(clean);
  };

  const overlayUrl = `${window.location.origin}/overlay?username=${username}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(overlayUrl);
    setCopied(true);
    toast({ title: "Copiado!", description: "Link do overlay copiado para a area de transferencia" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Swords className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Rastrear Pontos</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Conecte-se a uma live do TikTok e gere um overlay em tempo real para OBS
          </p>
        </div>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
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
            {isConnected && (
              <span className="text-sm text-muted-foreground">@{username}</span>
            )}
          </div>

          {!isConnected ? (
            <div className="space-y-3">
              <label className="text-sm font-medium" htmlFor="username-input">
                Username do criador da live
              </label>
              <div className="flex gap-2">
                <Input
                  id="username-input"
                  data-testid="input-username"
                  placeholder="@username"
                  value={inputUsername}
                  onChange={(e) => setInputUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                />
                <Button data-testid="button-connect" onClick={handleConnect}>
                  Conectar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Digite o @ do criador que esta transmitindo ao vivo no TikTok
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Link do Overlay para OBS</label>
                <div className="flex gap-2">
                  <Input
                    data-testid="input-overlay-url"
                    value={overlayUrl}
                    readOnly
                    className="text-xs"
                  />
                  <Button
                    data-testid="button-copy-overlay"
                    size="icon"
                    variant="outline"
                    onClick={handleCopy}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use este link no OBS como Fonte de Navegador com fundo transparente
                </p>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button data-testid="button-open-overlay" variant="outline" asChild>
                  <a href={`/overlay?username=${username}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Ver Overlay
                  </a>
                </Button>
                <Button data-testid="button-open-panel" variant="outline" asChild>
                  <a href={`/panel?username=${username}`} target="_blank" rel="noopener noreferrer">
                    <Swords className="w-4 h-4 mr-1" />
                    Painel de Controle
                  </a>
                </Button>
                <Button data-testid="button-disconnect" variant="destructive" onClick={onDisconnect}>
                  Desconectar
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-medium mb-2">Como usar</h3>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Digite o @username do criador que esta ao vivo no TikTok</li>
            <li>Clique em Conectar para iniciar o monitoramento</li>
            <li>Copie o link do overlay e adicione no OBS como Fonte de Navegador</li>
            <li>Marque "Fundo Transparente" nas propriedades da fonte no OBS</li>
            <li>Quando uma batalha comecar, o overlay atualizara automaticamente</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
