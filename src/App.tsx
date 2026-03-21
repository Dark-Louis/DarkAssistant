import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import { createAppDirectory, installAiri, launchAiri, checkAiriInstallation } from "./install";
import { airiGetAll, addCard, getCards } from "./airi-settings";

function App() {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    airiGetAll()
      .then(entries => console.log("[AIRI] All settings:", entries))
      .catch(e => console.warn("[AIRI] Settings not available yet:", e));

    getCards()
      .then(cards => console.log("[AIRI] Cards:", cards))
      .catch(e => console.warn("[AIRI] Cards not available yet:", e));

    createAppDirectory()
      .then(appDir => checkAiriInstallation(appDir))
      .then(state => {
        if (state === "ok") setStep(3);
        else setStep(1);
      })
      .catch(e => {
        console.error("[AIRI] Check failed:", e);
        setStep(1);
      });
  }, []);

  const handleStatus = (msg: string) => {
    setStatus(msg);
    const match = msg.match(/(\d+)%/);
    if (match) setProgress(parseInt(match[1]));
  };

  switch (step) {
    case 0: return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6">
        <h1 className="text-2xl font-semibold">Vérification de l'installation...</h1>
        <Spinner />
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
        <Button onClick={() => {
          setStep(4);
          const testCard = {
            id: "test",
            name: "Test",
            version: "1.0.0",
            description: "Une card de test",
            greetings: ["Bonjour ! Je suis une card de test."],
            extensions: {
              airi: {
                modules: {
                  consciousness: { provider: "", model: "" },
                  speech: { provider: "speech-noop", model: "", voice_id: "" },
                },
                agents: {},
              },
            },
          };
          addCard(testCard)
            .then(() => createAppDirectory())
            .then((appDir: string) => launchAiri(appDir))
            .catch(console.error);
        }}>Continuer</Button>
      </main>
    );

    case 4: return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6">
        <h1 className="text-2xl font-semibold">AIRI est lancé !</h1>
        <p className="text-sm text-muted-foreground">La card "test" a été ajoutée avec succès.</p>
      </main>
    );
  }
}

export default App;
