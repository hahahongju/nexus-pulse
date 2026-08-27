const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const si = require('systeminformation');

async function test() {
  console.log('=== Virtualization & Container Info ===');
  
  // 1. Hardware Virt in /proc/cpuinfo
  const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
  const hasVmx = cpuinfo.includes(' vmx ') || cpuinfo.includes('\nflags\t\t: .*vmx');
  const hasSvm = cpuinfo.includes(' svm ') || cpuinfo.includes('\nflags\t\t: .*svm');
  const hasHypervisor = cpuinfo.includes(' hypervisor ');
  const kvmExists = fs.existsSync('/dev/kvm');

  console.log('Hardware Virtualization:', {
    hasVmx,
    hasSvm,
    hasHypervisor,
    kvmExists,
    type: hasSvm ? 'AMD-V (Secure Virtual Machine)' : hasVmx ? 'Intel VT-x (Virtual Machine eXtentions)' : 'None'
  });

  // 2. systemd-detect-virt
  let virtType = 'none';
  try {
    virtType = execSync('systemd-detect-virt 2>/dev/null || echo "none"', { encoding: 'utf8' }).trim();
  } catch (e) {}
  console.log('systemd-detect-virt:', virtType);

  // 3. Docker info & containers
  try {
    const dInfo = await si.dockerInfo();
    const dContainers = await si.dockerContainers(true);
    console.log('Docker Info:', {
      serverVersion: dInfo.serverVersion,
      containers: dInfo.containers,
      running: dInfo.containersRunning,
      images: dInfo.images
    });
    console.log('Containers count:', dContainers.length);
  } catch (e) {
    console.log('Docker error:', e.message);
  }

  // 4. Virsh / Qemu VMs
  let vms = [];
  try {
    const virshOut = execSync('virsh list --all 2>/dev/null || true', { encoding: 'utf8' }).trim();
    console.log('virsh output:\n', virshOut || 'Empty');
  } catch (e) {}

  // 5. Virtual Bridges
  const ifaces = os.networkInterfaces();
  const virtBridges = Object.keys(ifaces).filter(name => 
    name.startsWith('docker') || name.startsWith('virbr') || name.startsWith('br-') || name.startsWith('veth')
  );
  console.log('Virtual Bridges:', virtBridges);
}

test();
