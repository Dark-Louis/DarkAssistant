import { useState } from "react";
import { Button } from "@/components/ui/button";

function App() {
  const [step, setStep] = useState(0);

  switch (step) {
    case 0: return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6">
        <h1 className="text-2xl font-semibold">Bienvenue dans le DarkAssistant</h1>
        <Button onClick={() => setStep(1)}>Continuer</Button>
      </main>
    );

    case 2: return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6">
        <h1 className="text-2xl font-semibold">Le processus d'installation va commencer</h1>
        <Button onClick={() => setStep(2)}>Installer</Button>
      </main>
    );

    case 3: return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6">
        <h1 className="text-2xl font-semibold">C'est parti !</h1>
      </main>
    );
  }
}

export default App;
