import type { CommandConfig } from './types';

/**
 * Safe clipboard copy with fallback for older browsers
 */
export const safeCopy = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // Fall through to fallback
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Generate the installation command based on system configuration
 */
export const getInstallationCommand = (config: CommandConfig): string => {
  const { computerType, gpuType, memoryProfile, windowsShell, showDebugLogs, token } = config;
  const debugFlag = showDebugLogs ? ' --debug' : '';
  const profileFlag = ` --wgp-profile ${memoryProfile}`;

  // PyTorch install: 50 series needs cu128, ≤40 series uses cu124
  // Don't pin version - let pip grab the latest available in each index
  // Use python -m pip to ensure we use the venv's pip, not system pip
  const torchInstall = gpuType === "nvidia-50"
    ? `python -m pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128`
    : `python -m pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124`;

  if (computerType === "windows") {
    // Shell-specific activation command
    const activateCmd = windowsShell === "powershell"
      ? `.\\venv\\Scripts\\Activate.ps1`
      : `venv\\Scripts\\activate.bat`;

    // Install torch LAST to ensure CUDA version doesn't get overwritten by requirements
    return `git clone --depth 1 https://github.com/banodoco/Reigh-Worker.git
cd Reigh-Worker
python -m venv venv
${activateCmd}
python -m pip install --no-cache-dir -r Wan2GP/requirements.txt
python -m pip install --no-cache-dir -r requirements.txt
${torchInstall}
echo Checking CUDA availability...
python -c "import torch; assert torch.cuda.is_available(), 'ERROR: CUDA not available! Reinstall PyTorch with CUDA support.'; print('CUDA OK:', torch.cuda.get_device_name(0))"
python worker.py --reigh-access-token ${token}${debugFlag}${profileFlag}`;
  } else {
    // Linux command
    // Install torch LAST to ensure CUDA version doesn't get overwritten by requirements
    return `git clone --depth 1 https://github.com/banodoco/Reigh-Worker && \\
cd Reigh-Worker && \\
sudo apt-get update && sudo apt-get install -y python3.10-venv python3.10-dev ffmpeg && \\
python3.10 -m venv venv && \\
source venv/bin/activate && \\
python -m pip install --no-cache-dir -r Wan2GP/requirements.txt && \\
python -m pip install --no-cache-dir -r requirements.txt && \\
${torchInstall} && \\
python -c "import torch; assert torch.cuda.is_available(), 'ERROR: CUDA not available! Reinstall PyTorch with CUDA support.'; print('CUDA OK:', torch.cuda.get_device_name(0))" && \\
python worker.py --reigh-access-token ${token}${debugFlag}${profileFlag}`;
  }
};

/**
 * Generate the run command for an already installed worker
 */
export const getRunCommand = (config: CommandConfig): string => {
  const { computerType, memoryProfile, windowsShell, showDebugLogs, token } = config;
  const debugFlag = showDebugLogs ? ' --debug' : '';
  const profileFlag = ` --wgp-profile ${memoryProfile}`;

  if (computerType === "windows") {
    // Shell-specific activation and directory check
    const cdCheck = windowsShell === "powershell"
      ? `if (!(Test-Path worker.py)) { cd Reigh-Worker }`
      : `if not exist worker.py cd Reigh-Worker`;
    const activateCmd = windowsShell === "powershell"
      ? `.\\venv\\Scripts\\Activate.ps1`
      : `venv\\Scripts\\activate.bat`;

    return `${cdCheck}
git pull
${activateCmd}
python worker.py --reigh-access-token ${token}${debugFlag}${profileFlag}`;
  } else {
    // Linux / Mac command - auto-cd if not in correct folder
    return `[ ! -f "worker.py" ] && cd Reigh-Worker
git pull && \\
source venv/bin/activate && \\
python worker.py --reigh-access-token ${token}${debugFlag}${profileFlag}`;
  }
};

/**
 * Generate AI troubleshooting instructions
 */
export const generateAIInstructions = (
  config: CommandConfig,
  activeInstallTab: string
): string => {
  const { computerType } = config;
  const isWindows = computerType === "windows";
  const isInstalling = activeInstallTab === "need-install";

  const prerequisites = isWindows ? `

PREREQUISITES (Windows only - install these first):
1. NVIDIA GPU with CUDA 6.0+ and 8GB+ VRAM
   - Check with: nvidia-smi
   - AMD/Intel GPUs will NOT work for local processing

2. Latest NVIDIA drivers from nvidia.com/drivers
   - Download and install latest drivers
   - Restart computer after installation
   - Verify with: nvidia-smi

3. Python 3.10+ from python.org (NOT Microsoft Store)
   - During install, check "Add Python to PATH"
   - Verify with: python --version

4. Git from git-scm.com/download/win
   - Use default settings during installation
   - Verify with: git --version

5. FFmpeg from ffmpeg.org/download.html
   - Download "Windows builds by BtbN" (recommended)
   - Extract to C:\\ffmpeg
   - Add C:\\ffmpeg\\bin to system PATH
   - Verify with: ffmpeg -version
   - Need PATH help? Search "Windows add to PATH" on YouTube
` : '';

  const installCommand = isInstalling ? getInstallationCommand(config) : getRunCommand(config);
  const commandType = isInstalling ? "INSTALLATION" : "RUN";

  return `I'm trying to set up a local AI worker for Reigh and need help troubleshooting.

FIRST - Please ask me these questions to understand my setup:
1. What's my operating system and version?
2. What graphics card do I have and how much VRAM? (need at least 8GB for local AI processing)
3. What's my total system RAM?
4. How much free disk space do I have? (AI models can be 10+ GB)
5. Am I using a laptop or desktop computer?
6. Am I getting any specific error messages? If so, what exactly?
7. Have I completed the prerequisites for my system?
8. Do I have experience setting up AI/ML tools before?

SYSTEM REQUIREMENTS:
- NVIDIA GPU with CUDA Compute Capability 6.0+ (AMD/Intel GPUs will NOT work)
- Minimum 8GB VRAM (graphics card memory) for local AI processing
- Latest NVIDIA drivers and CUDA Toolkit
- Windows 10/11, Linux, or Mac (though Mac isn't currently supported for local processing)
- Git, Python 3.10+, FFmpeg installed
- PyTorch with CUDA support (critical - CPU-only PyTorch will NOT work)${prerequisites}

MY CURRENT SITUATION:
- Operating System: ${computerType === "windows" ? "Windows" : computerType === "linux" ? "Linux" : "Mac"}
- Task: ${isInstalling ? "Initial installation" : "Running existing installation"}
- Status: Encountering errors

${commandType} COMMAND I'M USING:
\`\`\`
${installCommand}
\`\`\`

WHAT I NEED:
After understanding my system specs, please guide me step-by-step through this process. If I encounter any errors:
1. Help me understand what went wrong
2. Provide the exact commands to fix it
3. Explain how to verify each step worked
4. Tell me what to do next

Please be very specific with file paths, command syntax, and verification steps since I'm on ${computerType === "windows" ? "Windows" : computerType}.`;
};
