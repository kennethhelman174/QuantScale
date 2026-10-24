/** Read-only GitHub status. Deployment itself belongs to the isolated systemd timer. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);
type Result = 'SUCCESS' | 'FAILED' | 'ROLLED_BACK' | 'IDLE';
export class GithubUpdaterService {
  private readonly repoUrl = 'https://github.com/kennethhelman174/QuantScale.git';
  private readonly branchFile = path.join(os.homedir(), '.config/quantscale/deploy_branch');
  private runningCommit = '';
  private latestCommit = '';
  private lastCheckTimestamp = 0;
  private lastDeploymentResult: Result = 'IDLE';
  private lastDeploymentError?: string;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private autoDeployEnabled = false;
  public getStatus() {
    const branch = fs.existsSync(this.branchFile) ? fs.readFileSync(this.branchFile, 'utf8').trim() : 'main';
    return {
      repoUrl: this.repoUrl, branch, runningVersion: 'preview-safe-paper',
      runningCommit: this.runningCommit, latestCommit: this.latestCommit,
      lastCheckTimestamp: this.lastCheckTimestamp,
      isUpdateAvailable: !!this.latestCommit && !!this.runningCommit && this.latestCommit !== this.runningCommit,
      isUpdating: false,
      lastDeploymentResult: this.lastDeploymentResult,
      lastDeploymentError: this.lastDeploymentError,
      autoDeployEnabled: this.autoDeployEnabled,
    };
  }
  public async checkUpdate() {
    this.lastCheckTimestamp = Date.now();
    try {
      const current = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), timeout: 12000 });
      this.runningCommit = current.stdout.trim();
      const info = this.getStatus();
      const upstream = await execFileAsync('git', ['ls-remote', this.repoUrl, 'refs/heads/' + info.branch], { timeout: 15000 });
      this.latestCommit = upstream.stdout.trim().split(/\s+/)[0] || this.runningCommit;
      this.lastDeploymentError = undefined;
      try {
        const enabled = await execFileAsync('systemctl', ['--user', 'is-enabled', 'quantscale-update.timer'], { timeout: 3000 });
        this.autoDeployEnabled = enabled.stdout.trim() === 'enabled';
      } catch { this.autoDeployEnabled = false; }
    } catch (e) {
      this.lastDeploymentError = 'Could not refresh GitHub status: ' + String(e);
    }
    return this.getStatus();
  }
  public startAutoCheck() {
    if (this.timerId) return;
    void this.checkUpdate();
    this.timerId = setInterval(() => void this.checkUpdate(), 600000);
  }
  public stopAutoCheck() {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
  }
  public toggleAutoDeploy(): boolean {
    // Must be changed through systemd, not through a browser or a running trading process.
    return this.autoDeployEnabled;
  }
  public async performSafeDeployment(): Promise<{success:boolean; message:string}> {
    return { success: false, message: 'Deployment is managed only by the isolated systemd quantscale-update.timer.' };
  }
}
export const githubUpdater = new GithubUpdaterService();
