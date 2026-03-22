import { useEffect, useState } from "react";
import { Check, Trash2, FolderX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { platform } from "@tauri-apps/plugin-os";
import { homeDir, join } from "@tauri-apps/api/path";
import { remove } from "@tauri-apps/plugin-fs";
import { createAppDirectory, installAiri, launchAiri, killAiri, checkAiriInstallation } from "./install";
import { airiGetAll, airiSet, upsertCard, getCards, setActiveCardId } from "./airi-settings";
import cardsData from "./cards.json";

type InstallStepDef = { label: string; match: string; showProgress?: boolean };

function getInstallSteps(os: string, hasOldInstall: boolean): InstallStepDef[] {
  return [
    ...(hasOldInstall ? [{ label: "Suppression de l'ancienne installation", match: "Suppression" }] : []),
    { label: "Téléchargement", match: "Téléchargement", showProgress: true },
    ...(os !== "windows" ? [{ label: "Décompression", match: "Extraction" }] : []),
    { label: "Nettoyage", match: "Nettoyage" },
  ];
}

function Screen({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className={cn("w-full rounded-xl border border-border bg-card p-8 shadow-sm", wide ? "max-w-2xl" : "max-w-sm")}>
        {children}
      </div>
    </main>
  );
}

async function getAiriInstallDir(): Promise<string> {
  const home = await homeDir();
  const os = platform();
  const base = os === "windows"
    ? await join(home, "AppData", "Roaming", "DarkLouis", "DarkAssistant", "airi")
    : await join(home, ".local", "share", "DarkLouis", "DarkAssistant", "airi");
  return base;
}

async function getAiriConfigDir(): Promise<string> {
  const home = await homeDir();
  const os = platform();
  return os === "windows"
    ? await join(home, "AppData", "Roaming", "ai.moeru.airi")
    : await join(home, ".config", "ai.moeru.airi");
}

function DebugToolbar() {
  const handleDeleteInstall = async () => {
    if (!confirm("Supprimer le dossier d'installation d'AIRI ?")) return;
    await killAiri();
    const dir = await getAiriInstallDir();
    await remove(dir, { recursive: true }).catch(() => { });
    window.location.reload();
  };

  const handleDeleteConfig = async () => {
    if (!confirm("Supprimer le dossier de config d'AIRI ?")) return;
    await killAiri();
    const dir = await getAiriConfigDir();
    await remove(dir, { recursive: true }).catch(() => { });
    window.location.reload();
  };

  return (
    <div className="fixed top-3 right-3 z-50 flex gap-1.5">
      <Button variant="outline" size="icon" className="size-8" onClick={handleDeleteInstall}>
        <FolderX className="size-4" />
      </Button>
      <Button variant="outline" size="icon" className="size-8" onClick={handleDeleteConfig}>
        <Trash2 className="size-4" />
      </Button>
    </div>
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

  const content = (() => {
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
                          <Progress value={isCompleted ? 100 : progress} className={cn("h-1 w-40", isCompleted && "[&>[data-slot=progress-indicator]]:bg-muted-foreground")} />
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
                AIRI est prêt à être configuré.
              </p>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={() => setStep(4)}
            >
              Configurer
            </Button>
          </div>
        </Screen>
      );

      case 4: {
        const mockCards = cardsData;

        const handleSelectCard = (card: typeof mockCards[0]) => {
          setStep(5);
          const airiCard = {
            id: card.id,
            name: card.name,
            description: card.description,
            greetings: card.greetings,
            extensions: {
              airi: {
                modules: {
                  consciousness: card.consciousness,
                  speech: card.speech,
                },
                agents: {},
              },
            },
          };
          killAiri()
            .then(() => upsertCard(airiCard))
            .then(() => setActiveCardId(airiCard.id))
            .then(() => airiSet("settings/consciousness/enabled", "true"))
            .then(() => airiSet("settings/consciousness/active-provider", card.consciousness.provider))
            .then(() => airiSet("settings/consciousness/active-model", card.consciousness.model))
            .then(() => createAppDirectory())
            .then((appDir: string) => launchAiri(appDir))
            .catch(console.error);
        };

        return (
          <Screen wide>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <h1 className="text-lg font-semibold text-card-foreground">Choisissez votre compagnon</h1>
                <p className="text-sm text-muted-foreground">Sélectionnez une card pour commencer.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {mockCards.map(card => (
                  <button
                    key={card.id}
                    onClick={() => handleSelectCard(card)}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    <span className="text-sm font-medium text-card-foreground">{card.name}</span>
                    <span className="text-xs text-muted-foreground leading-relaxed">{card.label}</span>
                    {card.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {card.tags.map(tag => (
                          <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </Screen>
        );
      }

      case 5: return (
        <Screen>
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold text-card-foreground">AIRI est lancé</h1>
            <p className="text-sm text-muted-foreground">La card a été ajoutée avec succès.</p>
          </div>
        </Screen>
      );
    }
  })();

  return (
    <>
      <DebugToolbar />
      {content}
    </>
  );
}

export default App;
