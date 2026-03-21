import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { platform } from "@tauri-apps/plugin-os";
import { createAppDirectory, installAiri, launchAiri, checkAiriInstallation } from "./install";
import { airiGetAll, addCard, getCards } from "./airi-settings";

type InstallStepDef = { label: string; match: string; showProgress?: boolean };

function getInstallSteps(os: string, hasOldInstall: boolean): InstallStepDef[] {
  return [
    ...(hasOldInstall ? [{ label: "Suppression de l'ancienne installation", match: "Suppression" }] : []),
    { label: "Téléchargement", match: "Téléchargement", showProgress: true },
    ...(os !== "windows" ? [{ label: "Décompression", match: "Extraction" }] : []),
    { label: "Nettoyage", match: "Nettoyage" },
  ];
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        {children}
      </div>
    </main>
  );
}

function App() {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [installStep, setInstallStep] = useState(-1);
  const [hasOldInstall, setHasOldInstall] = useState(false);
  const [os] = useState(() => platform());

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
        else {
          setHasOldInstall(state === "corrupted");
          setStep(1);
        }
      })
      .catch(e => {
        console.error("[AIRI] Check failed:", e);
        setStep(1);
      });
  }, []);

  const handleStatus = (msg: string) => {
    const match = msg.match(/(\d+)%/);
    if (match) setProgress(parseInt(match[1]));

    const steps = getInstallSteps(os, hasOldInstall);
    const idx = steps.findIndex(s => msg.includes(s.match));
    if (idx !== -1) setInstallStep(idx);
  };

  switch (step) {
    case 0: return (
      <Screen>
        <div className="flex flex-col items-center gap-4 text-center">
          <Spinner className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Vérification de l'installation...</p>
        </div>
      </Screen>
    );

    case 1: return (
      <Screen>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold text-card-foreground">Installer AIRI</h1>
            <p className="text-sm text-muted-foreground">
              L'application n'est pas encore installée. Cliquez sur le bouton ci-dessous pour lancer l'installation.
            </p>
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              setStep(2);
              createAppDirectory()
                .then(appDir => installAiri(appDir, handleStatus))
                .then(() => setStep(3))
                .catch(console.error);
            }}
          >
            Installer
          </Button>
        </div>
      </Screen>
    );

    case 2: {
      const installSteps = getInstallSteps(os, hasOldInstall);
      return (
        <Screen>
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <Spinner className="size-4 text-muted-foreground" />
              <h1 className="text-lg font-semibold text-card-foreground">Installation en cours</h1>
            </div>
            <div className="flex flex-col">
              {installSteps.map((s, i) => {
                const isCompleted = i < installStep;
                const isActive = i === installStep;
                const isLast = i === installSteps.length - 1;
                return (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={cn(
                        "size-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                        isCompleted && "border-primary bg-primary",
                        isActive && "border-primary bg-primary/10",
                        !isCompleted && !isActive && "border-border",
                      )}>
                        {isCompleted && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
                        {isActive && <div className="size-2 rounded-full bg-primary" />}
                      </div>
                      {!isLast && (
                        <div className={cn(
                          "w-px flex-1 my-1 min-h-2 transition-colors",
                          isCompleted ? "bg-primary/30" : "bg-border",
                        )} />
                      )}
                    </div>
                    <div className={cn("flex flex-col gap-1.5", isLast ? "pb-0" : "pb-3.5")}>
                      <p className={cn(
                        "text-sm leading-5 transition-colors",
                        isActive && "font-medium text-card-foreground",
                        isCompleted && "text-muted-foreground",
                        !isCompleted && !isActive && "text-muted-foreground/40",
                      )}>
                        {s.label}
                      </p>
                      {s.showProgress && (
                        <Progress value={progress} className="h-1 w-40" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Screen>
      );
    }

    case 3: return (
      <Screen>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold text-card-foreground">Installation terminée</h1>
            <p className="text-sm text-muted-foreground">
              AIRI est prêt à être lancé.
            </p>
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={() => {
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
            }}
          >
            Lancer
          </Button>
        </div>
      </Screen>
    );

    case 4: return (
      <Screen>
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-card-foreground">AIRI est lancé</h1>
          <p className="text-sm text-muted-foreground">La card "test" a été ajoutée avec succès.</p>
        </div>
      </Screen>
    );
  }
}

export default App;
