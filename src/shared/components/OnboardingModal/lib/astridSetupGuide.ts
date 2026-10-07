/**
 * What first-run setup tells a person and their agent. Kept in one place so the agent brief, the manual
 * steps and the reconnect command always describe the same install.
 *
 * Everything points at one Astrid ref. The agent follows the setup skill *at that ref*, so its
 * instructions always match the code it installs. The manual steps mirror that ref's setup guide
 * (docs/setup/README.md); when the guide changes (for example when the streamlined `astrid setup` flow
 * reaches main), update MANUAL_SETUP_STEPS and RECONNECT_COMMAND to match.
 */

export const ASTRID_REPO = 'https://github.com/peteromallet/Astrid';
export const ASTRID_SETUP_REF = 'main';

const blobUrl = (path: string) => `${ASTRID_REPO}/blob/${ASTRID_SETUP_REF}/${path}`;
export const SETUP_SKILL_URL = blobUrl('docs/setup/SKILL.md');
export const SETUP_GUIDE_URL = blobUrl('docs/setup/README.md');
export const SETUP_TROUBLESHOOTING_URL = blobUrl('docs/setup/troubleshooting.md');

export type SetupPlatform = 'unix' | 'windows';

/** The person's operating system, for showing the right commands; Linux and macOS share one path. */
export function detectSetupPlatform(): SetupPlatform {
  if (typeof navigator === 'undefined') return 'unix';
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = `${nav.userAgentData?.platform ?? ''} ${nav.platform ?? ''} ${nav.userAgent ?? ''}`.toLowerCase();
  // Match Windows itself, not any "win" ("darwin" is macOS).
  return /\bwindows\b|\bwin(32|64)\b/.test(platform) ? 'windows' : 'unix';
}

/** Restarts an existing install's Runtime, from the folder Astrid was installed into. */
export const RECONNECT_COMMANDS: Record<SetupPlatform, string> = {
  unix: 'cd ~/astrid-local && source .venv/bin/activate && banodoco-local up --profile astrid',
  windows: 'cd ~\\astrid-local; .\\.venv\\Scripts\\Activate.ps1; banodoco-local up --profile astrid',
};

/**
 * Opens Astrid itself: its own agent, with Astrid's system prompt and skills. The first time, `--onboard`
 * chooses the AI model Astrid thinks with.
 */
export const ASTRID_LAUNCH_COMMANDS: Record<SetupPlatform, string> = {
  unix: 'cd ~/astrid-local && source .venv/bin/activate\nastrid --onboard   # first time only: choose the AI model Astrid uses\nastrid',
  windows: 'cd ~\\astrid-local; .\\.venv\\Scripts\\Activate.ps1\nastrid --onboard   # first time only: choose the AI model Astrid uses\nastrid',
};

/**
 * The first message to send Astrid once it's installed. Astrid already has its skills and knows its own
 * packs, so this only sets the agenda: a short conversation about how the person will make things,
 * grounded in what the generation, vibecomfy, comfy_wrap and runpod packs support, ending in a real test.
 */
export const ASTRID_STUDIO_MESSAGE = `Hi Astrid, I've just installed you. Please help me set up how I'll make things, asking one question at a time with a suggested default, and checking each step works.

1. Check this computer's GPU, then ask how I'd like to generate, recommending one: locally on my GPU (ComfyUI inside Astrid), on a rented GPU (RunPod, which costs money while running), or through hosted APIs (fal, or OpenAI for some images). A hosted Astrid is coming soon, but APIs technically work today. A mix is fine.
2. If local: ask whether I already use ComfyUI and where my model files are, and point Astrid at my existing model folders (extra_model_paths.yaml) instead of downloading them again. Ask which models I like, offer the local ones your catalog supports, and tell me each download's size before fetching it.
3. For APIs or RunPod: have me store each key with astrid-credential, never in chat, and tell me roughly what generations cost.
4. Ask if I have ComfyUI workflows to bring in. Import each with vibecomfy, and wrap simple prompt-driven ones with comfy_wrap so I can use them by name.
5. Create a first project and make one quick test generation, so I can see it in the Astrid app.

Then summarise what's set up and ask what I'd like to make.`;

/**
 * The brief a person pastes into their coding agent. Written for the agent, in two parts: install (follow
 * the setup skill; ask only what install needs; exactly what "done" means) and studio setup (a short,
 * adaptive conversation about how the person will generate, grounded in what the generation, vibecomfy,
 * comfy_wrap and runpod packs actually support, ending in a real test generation). The app watches the
 * Runtime itself, so the agent never has to ask the person to relay anything back. It ends by offering
 * the person both ways to use Astrid: from inside another agent through the Astrid skill, or in Astrid's
 * own CLI agent by running `astrid`.
 */
export const AGENT_SETUP_BRIEF = `Please set up Astrid (a local-first creative tool + agent) on this computer, then get Astrid's own agent running. Do the work yourself, step by step, checking each result; don't just describe steps or hand them back to me. Ask me one question at a time, suggest a default, and skip anything that doesn't apply.

Use Astrid's main branch. Follow its setup skill and the guide it links to:
${SETUP_SKILL_URL}
(Manual guide: ${SETUP_GUIDE_URL})
If you can't open web links, clone ${ASTRID_REPO} and read docs/setup/SKILL.md there.

Ask me first:
- Which folder to install into (suggest ~/astrid-local).
Assume you are the agent I'll use Astrid from, and sync your own skills, unless I name another (Claude Code, Codex or Hermes).

Rules:
- Only macOS is validated so far. On Linux or Windows, tell me which step is unsupported before going further.
- Check what's already installed (Git, Python, oh-my-pi, an existing Astrid or ComfyUI) before installing anything, and reuse it. Only install what's missing or too old.
- Keep any existing Astrid install, credentials and agent instructions; don't use --force.
- Never ask me to paste API keys into chat. When a key is needed, have me enter it locally: astrid-credential set <provider>
- Leave Astrid's Runtime running when you finish; I'll be using it.
The install is done when every check in the guide's "Check the complete setup" section passes. Report each briefly, and never mark a blocked or skipped check as passed. The Astrid app watches the Runtime itself and shows me "You're set up", so you don't need to ask me to refresh anything.

FINALLY: HAND OVER TO ASTRID
Astrid has its own agent (the astrid command, which runs on oh-my-pi). Make sure running astrid opens it; if something it needs is missing, install that too. Then run astrid --onboard with me so I can choose the AI model Astrid uses.
Don't set up generation (GPU, models, API keys, workflows) yourself: Astrid does that with me.

End by telling me briefly what's ready, then offer me the two ways to use Astrid, and let me pick:
1. Inside an agent I already use, like you: through the Astrid skill you installed, I can just ask for Astrid there.
2. In Astrid's own dedicated agent: run astrid in a terminal.
Finish your reply with those two options.`;

export interface ManualSetupStep {
  title: string;
  detail: string;
  command?: string;
  /** A message to paste into Astrid (shown as text to copy, not a command). */
  message?: string;
}

/** Where to run the steps, per platform. */
export const MANUAL_SETUP_INTRO: Record<SetupPlatform, string> = {
  unix: 'Open Terminal (on a Mac: Applications → Utilities) and run each block in order, pasting the whole block at once. Keep using the same window: each step builds on the one before.',
  windows: 'Open PowerShell (Start → PowerShell) and run each block in order, pasting the whole block at once. Keep using the same window: each step builds on the one before.',
};

/** Only macOS is validated by Astrid's own setup guide so far. */
export const PLATFORM_VALIDATED: Record<SetupPlatform, boolean> = { unix: true, windows: false };

// The Runtime revision ASTRID_SETUP_REF's guide pins; update it with the guide.
const RUNTIME_PIN = 'bc74a4b2179de83ace55c35fa6371f10e1e58610';
const SOURCE_PROFILE = "import json, pathlib; r = pathlib.Path.cwd().resolve(); (r / 'astrid-source-profile.json').write_text(json.dumps({'profile': 'astrid', 'source_checkout': str(r / 'Astrid'), 'runtime_checkout': str(r / 'Runtime'), 'runtime_environment': str(r / '.venv')}, indent=2))";

/** Mirrors ASTRID_SETUP_REF's docs/setup/README.md, step for step, in each platform's shell. */
export const MANUAL_SETUP_STEPS: Record<SetupPlatform, readonly ManualSetupStep[]> = {
  unix: [
    {
      title: 'Check what you already have',
      detail: 'Astrid needs Git and Python 3.11 or newer. If both print a version (Python 3.11+), skip ahead. Macs include Git (the first use may offer to install developer tools) but an older Python 3.9, so most Macs need Python 3.11+ from python.org.',
      command: 'git --version && python3 --version',
    },
    {
      title: 'Install Astrid and its Runtime',
      detail: 'In a new folder. The Runtime is pinned to the revision this version of Astrid was tested with.',
      command: [
        'mkdir ~/astrid-local && cd ~/astrid-local',
        'git clone https://github.com/peteromallet/Astrid.git',
        'git clone https://github.com/banodoco/banodoco-workspace-runtime.git Runtime',
        `git -C Runtime checkout ${RUNTIME_PIN}`,
        'python3 -m venv .venv && source .venv/bin/activate',
        'python3 -m pip install -e ./Astrid -e ./Runtime',
      ].join('\n'),
    },
    {
      title: 'Launch the Runtime',
      detail: 'One-time: record where the install lives (no secrets), then start the Runtime. This page notices when it’s up.',
      command: `python3 -c "${SOURCE_PROFILE}"\nbanodoco-local up --profile astrid --source-manifest "$PWD/astrid-source-profile.json"`,
    },
    {
      title: 'Add the default knowledge pack',
      detail: 'Provisions the community knowledge source. Searching it needs an internet connection.',
      command: 'cd Astrid && python3 -m astrid.setup && python3 -m astrid.setup --check --offline',
    },
    {
      title: 'Connect your agent',
      detail: 'Installs Astrid’s skills into Claude Code, Codex or Hermes. Open a new agent session afterwards.',
      command: 'python3 -m astrid.skills.cli sync && python3 -m astrid.skills.cli sync --check',
    },
    {
      title: 'Check everything works',
      detail: 'Both should succeed. If not, the troubleshooting guide covers each failure.',
      command: 'python3 -m astrid doctor --json && python3 -m astrid projects list --json',
    },
    {
      title: 'Meet Astrid',
      detail: 'Open Astrid’s own agent. The first time, choose the AI model it thinks with. Then paste the message below and Astrid sets up how you’ll generate with you.',
      command: ASTRID_LAUNCH_COMMANDS.unix,
      message: ASTRID_STUDIO_MESSAGE,
    },
  ],
  windows: [
    {
      title: 'Check what you already have',
      detail: 'Astrid needs Git and Python 3.11 or newer. If both print a version (Python 3.11+), skip ahead; otherwise install Git from git-scm.com and Python from python.org.',
      command: 'git --version; py -3.11 --version',
    },
    {
      title: 'Install Astrid and its Runtime',
      detail: 'In a new folder. The Runtime is pinned to the revision this version of Astrid was tested with.',
      command: [
        'mkdir ~\\astrid-local; cd ~\\astrid-local',
        'git clone https://github.com/peteromallet/Astrid.git',
        'git clone https://github.com/banodoco/banodoco-workspace-runtime.git Runtime',
        `git -C Runtime checkout ${RUNTIME_PIN}`,
        'py -3.11 -m venv .venv; .\\.venv\\Scripts\\Activate.ps1',
        'python -m pip install -e .\\Astrid -e .\\Runtime',
      ].join('\n'),
    },
    {
      title: 'Launch the Runtime',
      detail: 'One-time: record where the install lives (no secrets), then start the Runtime. This page notices when it’s up.',
      command: `python -c "${SOURCE_PROFILE}"\nbanodoco-local up --profile astrid --source-manifest "$PWD\\astrid-source-profile.json"`,
    },
    {
      title: 'Add the default knowledge pack',
      detail: 'Provisions the community knowledge source. Searching it needs an internet connection.',
      command: 'cd Astrid; python -m astrid.setup; python -m astrid.setup --check --offline',
    },
    {
      title: 'Connect your agent',
      detail: 'Installs Astrid’s skills into Claude Code, Codex or Hermes. Open a new agent session afterwards.',
      command: 'python -m astrid.skills.cli sync; python -m astrid.skills.cli sync --check',
    },
    {
      title: 'Check everything works',
      detail: 'Both should succeed. If not, the troubleshooting guide covers each failure.',
      command: 'python -m astrid doctor --json; python -m astrid projects list --json',
    },
    {
      title: 'Meet Astrid',
      detail: 'Open Astrid’s own agent. The first time, choose the AI model it thinks with. Then paste the message below and Astrid sets up how you’ll generate with you.',
      command: ASTRID_LAUNCH_COMMANDS.windows,
      message: ASTRID_STUDIO_MESSAGE,
    },
  ],
};
