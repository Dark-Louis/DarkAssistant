import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import { createAppDirectory, installAiri } from "./install";

function App() {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);

  const handleStatus = (msg: string) => {
    setStatus(msg);
    const match = msg.match(/(\d+)%/);
    if (match) setProgress(parseInt(match[1]));
  };

  switch (step) {
    case 0: return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6">
        <h1 className="text-2xl font-semibold">Bienvenue dans le DarkAssistant</h1>
        <Button onClick={() => setStep(1)}>Continuer</Button>
      </main>
    );

    case 1: return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6">
        <h1 className="text-2xl font-semibold">Le processus d'installation va commencer</h1>
        <Button onClick={() => {
          setStep(2);
          createAppDirectory()
            .then(appDir => installAiri(appDir, handleStatus))
            .then(() => setStep(3))
            .catch(console.error);
        }}>Installer</Button>
      </main>
    );

    case 2: return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6">
        <h1 className="text-2xl font-semibold"><Spinner /> Installation principale d'AIRI...</h1>
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
        <Progress value={progress} className="w-64" />
      </main>
    );

    case 3: return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6">
        <h1 className="text-2xl font-semibold">Installation terminée !</h1>
        <Button onClick={() => setStep(4)}>Continuer</Button>
      </main>
    );
  }
}

export default App;
