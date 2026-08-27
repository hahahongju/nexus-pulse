const si = require('systeminformation');
const { execSync } = require('child_process');

async function test() {
  console.log('--- Testing Docker & Virtualization ---');
  try {
    const dInfo = await si.dockerInfo();
    console.log('si.dockerInfo:', JSON.stringify(dInfo, null, 2));
  } catch (e) {
    console.log('dockerInfo error:', e.message);
  }

  try {
    const dContainers = await si.dockerContainers(true);
    console.log('si.dockerContainers count:', dContainers.length);
    console.log('si.dockerContainers sample:', dContainers[0] || 'None');
  } catch (e) {
    console.log('dockerContainers error:', e.message);
  }

  try {
    const virt = execSync('systemd-detect-virt || echo "none"', { encoding: 'utf8' }).trim();
    console.log('systemd-detect-virt:', virt);
  } catch (e) {
    console.log('systemd-detect-virt error:', e.message);
  }
}

test();
