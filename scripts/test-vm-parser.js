const { execSync } = require('child_process');

function getVms() {
  const vms = [];
  try {
    // 1. Check Virsh
    let virshOut = '';
    try {
      virshOut = execSync('virsh -c qemu:///system list --all 2>/dev/null || virsh list --all 2>/dev/null || true', { encoding: 'utf8' }).trim();
    } catch (e) {}

    // 2. Check QEMU processes in ps aux
    let psOut = '';
    try {
      psOut = execSync('ps aux | grep "[q]emu-system"', { encoding: 'utf8' }).trim();
    } catch (e) {}

    const qemuProcesses = [];
    if (psOut) {
      for (const line of psOut.split('\n')) {
        const cols = line.trim().split(/\s+/);
        if (cols.length >= 11) {
          const user = cols[0];
          const pid = parseInt(cols[1], 10);
          const cpu = parseFloat(cols[2]) || 0;
          const mem = parseFloat(cols[3]) || 0;
          const cmd = cols.slice(10).join(' ');

          // Extract guest name from cmd: -name guest=win-vpn or -name win-vpn
          let guestName = '';
          const nameMatch = cmd.match(/-name\s+(?:guest=)?([a-zA-Z0-9._-]+)/);
          if (nameMatch) {
            guestName = nameMatch[1];
          }

          // Extract RAM from cmd: -m size=6291456k or -m 4096
          let memMb = 0;
          const memMatch = cmd.match(/-m\s+(?:size=)?([0-9]+)([kmg]?)/i);
          if (memMatch) {
            const val = parseInt(memMatch[1], 10);
            const unit = (memMatch[2] || 'm').toLowerCase();
            if (unit === 'k') memMb = Math.round(val / 1024);
            else if (unit === 'g') memMb = val * 1024;
            else memMb = val;
          }

          // Extract vCPUs: -smp 4 or -smp cpus=4
          let vcpus = 1;
          const smpMatch = cmd.match(/-smp\s+(?:cpus=)?([0-9]+)/);
          if (smpMatch) {
            vcpus = parseInt(smpMatch[1], 10);
          }

          // Extract primary disk
          let diskPath = '';
          const diskMatch = cmd.match(/(?:filename=|-drive\s+file=)([^, ]+\.(?:qcow2|raw|img|iso))/);
          if (diskMatch) {
            diskPath = diskMatch[1];
          }

          // Extract display port: -spice port=5900 or -vnc :0
          let display = '';
          const spiceMatch = cmd.match(/-spice\s+port=([0-9]+)/);
          if (spiceMatch) display = `SPICE :${spiceMatch[1]}`;
          const vncMatch = cmd.match(/-vnc\s+:([0-9]+)/);
          if (vncMatch) display = `VNC :${5900 + parseInt(vncMatch[1], 10)}`;

          qemuProcesses.push({
            pid,
            guestName,
            cpu,
            mem,
            memMb,
            vcpus,
            diskPath,
            display
          });
        }
      }
    }

    if (virshOut) {
      const lines = virshOut.split('\n').slice(2);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const id = parts[0] === '-' ? '-' : parts[0];
          const name = parts[1];
          const rawState = parts.slice(2).join(' ').toLowerCase();
          const state = rawState.includes('running') ? 'running' :
                        rawState.includes('paused') ? 'paused' :
                        rawState.includes('in shutdown') ? 'in shutdown' : 'shut off';

          // Get detailed dominfo if possible
          let vcpus = 2;
          let memoryMb = 2048;
          let autostart = false;
          try {
            const infoOut = execSync(`virsh -c qemu:///system dominfo ${name} 2>/dev/null || true`, { encoding: 'utf8' });
            const vcpuM = infoOut.match(/CPU\(s\):\s+([0-9]+)/);
            if (vcpuM) vcpus = parseInt(vcpuM[1], 10);
            const memM = infoOut.match(/Max memory:\s+([0-9]+)\s+KiB/);
            if (memM) memoryMb = Math.round(parseInt(memM[1], 10) / 1024);
            if (infoOut.includes('Autostart:      enable')) autostart = true;
          } catch (e) {}

          const proc = qemuProcesses.find(p => p.guestName === name) || {};

          vms.push({
            id,
            name,
            status: state,
            vcpus: proc.vcpus || vcpus,
            memoryMb: proc.memMb || memoryMb,
            diskImage: proc.diskPath || 'Standard Storage',
            displayPort: proc.display || 'Spice/VNC',
            pid: proc.pid || null,
            cpuPercent: proc.cpu || 0,
            memPercent: proc.mem || 0,
            hypervisor: 'KVM / QEMU (libvirt)',
            autostart
          });
        }
      }
    }

    // Add any standalone QEMU process not listed in virsh
    for (const proc of qemuProcesses) {
      if (proc.guestName && !vms.some(v => v.name === proc.guestName)) {
        vms.push({
          id: String(proc.pid),
          name: proc.guestName,
          status: 'running',
          vcpus: proc.vcpus || 1,
          memoryMb: proc.memMb || 1024,
          diskImage: proc.diskPath || 'Unknown Disk',
          displayPort: proc.display || 'VNC',
          pid: proc.pid,
          cpuPercent: proc.cpu || 0,
          memPercent: proc.mem || 0,
          hypervisor: 'QEMU Standalone',
          autostart: false
        });
      }
    }

  } catch (err) {
    console.error('Error fetching VMs:', err);
  }

  return vms;
}

const vms = getVms();
console.log('Detected VMs:', JSON.stringify(vms, null, 2));
