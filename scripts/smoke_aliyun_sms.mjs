/** Live PNVS smoke test for the dedicated RAM user. Secrets are supplied only
 * through this process's environment; this script never prints them or the
 * phone number/code. Run via smoke_aliyun_sms.ps1 on the owner's computer. */
import { checkVerify, sendVerify, smsConfigured } from '../phone-api.js'

const mode = process.argv[2]
const phone = process.env.SMS_TEST_PHONE || ''
if (!smsConfigured() || !/^1[3-9]\d{9}$/.test(phone)) {
  console.error('缺少短信配置或测试手机号格式不正确。')
  process.exitCode = 2
} else {
  try {
    if (mode === 'send') {
      await sendVerify(phone)
      console.log('专用 RAM 账号的短信发送接口已受理，请查看手机。')
    } else if (mode === 'check') {
      const code = process.env.SMS_TEST_CODE || ''
      if (!/^\d{4,8}$/.test(code)) throw new Error('验证码格式不正确。')
      if (!await checkVerify(phone, code)) throw new Error('验证码核验未通过。')
      console.log('专用 RAM 账号的验证码核验通过。')
    } else {
      throw new Error('测试模式只能是 send 或 check。')
    }
  } catch (error) {
    // Provider error codes/messages are useful for troubleshooting, but never
    // print environment variables or the phone/code supplied by the owner.
    let message = String(error?.message || '短信测试失败。')
    for (const secret of [phone, process.env.SMS_TEST_CODE, process.env.ALIYUN_SMS_ACCESS_KEY_ID,
      process.env.ALIYUN_SMS_ACCESS_KEY_SECRET]) {
      if (secret) message = message.replaceAll(secret, '[已隐藏]')
    }
    console.error(message)
    process.exitCode = 1
  }
}
