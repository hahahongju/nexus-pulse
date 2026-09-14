#!/usr/bin/env node
/**
 * NexusPulse - Zero-Cost RFC 6238 TOTP 2FA Setup CLI Tool
 * 
 * 100% Free: No SMS fees, no external SaaS subscriptions (Twilio/Duo/AWS).
 * Works directly with Google Authenticator, Microsoft Authenticator, Aegis, 2FAS.
 */

const readline = require('readline');
const QRCode = require('qrcode');
const authStore = require('../server/security/authStore');

async function main() {
  console.log('====================================================');
  console.log('  🛡️  NexusPulse 100% 무료 OTP (2FA) 설정 도구 🛡️');
  console.log('====================================================');
  console.log('  • 비용: 0원 (평생 무료, 외부 통신사/SMS 요금 없음)');
  console.log('  • 지원 앱: Google Authenticator, Microsoft Authenticator,');
  console.log('             Aegis Authenticator, 2FAS, Apple Passwords');
  console.log('  • 표준: RFC 6238 TOTP (30초 주기 6자리 일회용 비밀번호)');
  console.log('====================================================\n');

  await authStore.init();

  const isEnabled = authStore.is2FAEnabled();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (q) => new Promise(res => rl.question(q, res));

  if (isEnabled) {
    console.log('✅ 현재 2단계 인증(OTP)이 이미 [ 활성화 ] 되어 있습니다.\n');
    const answer = await question('OTP 설정을 해제(재설정)하시겠습니까? (y/N): ');
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('취소되었습니다.');
      rl.close();
      return;
    }

    const verifyCode = await question('현재 Authenticator 앱의 6자리 코드 또는 비상 복구 코드를 입력하세요: ');
    try {
      authStore.disable2FA(verifyCode.trim());
      console.log('\n✅ 2FA가 성공적으로 해제되었습니다. 새로운 OTP 등록을 진행합니다.\n');
    } catch (e) {
      console.error('\n❌ 해제 실패:', e.message);
      rl.close();
      return;
    }
  }

  console.log('1. 스마트폰 Authenticator 앱용 등록 QR 코드를 생성합니다...\n');
  const setup = await authStore.generate2FASetup('admin', 'NexusPulse');

  // Print ASCII Terminal QR Code
  await new Promise((resolve) => {
    QRCode.toString(setup.otpauthUrl, { type: 'terminal', small: true }, (err, str) => {
      if (!err && str) {
        console.log(str);
      }
      resolve();
    });
  });

  console.log('----------------------------------------------------');
  console.log('📱 스마트폰 카메라 또는 Authenticator 앱으로 위 QR 코드를 스캔하세요.');
  console.log('----------------------------------------------------');
  console.log('• 수동 입력용 시크릿 키: ' + setup.secret);
  console.log('• 계정 이름:            admin (NexusPulse)');
  console.log('----------------------------------------------------\n');

  console.log('⚠️ [중요] 비상 복구 코드 (스마트폰 분실 시 로그인용):');
  setup.backupCodes.forEach((code, idx) => {
    console.log(`   [${idx + 1}] ${code}`);
  });
  console.log('----------------------------------------------------\n');

  const codeInput = await question('Authenticator 앱에 표시된 6자리 번호를 입력하세요: ');
  const cleanCode = codeInput.trim().replace(/\s+/g, '');

  try {
    authStore.enable2FA(setup.secret, cleanCode, setup.backupCodes);
    console.log('\n====================================================');
    console.log('🎉 Google / MS Authenticator 연동이 완료되었습니다!');
    console.log('   이제 로그인 시 PIN 번호와 함께 스마트폰의 6자리');
    console.log('   일회용 비밀번호(OTP)가 안전하게 요구됩니다.');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ 등록 실패:', err.message);
    console.log('스마트폰의 시간과 서버 시간이 일치하는지 확인 후 다시 시도해주세요.');
  }

  rl.close();
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
