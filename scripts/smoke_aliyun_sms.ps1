# Inputs stay in this PowerShell process and are removed afterward; nothing is
# written to an env file. The script can be launched from any directory.
$ErrorActionPreference = 'Stop'
$secretHandle = [IntPtr]::Zero
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  $env:ALIYUN_SMS_ACCESS_KEY_ID = Read-Host '输入 lulucard-sms 的 AccessKey ID'
  $secureSecret = Read-Host '输入 AccessKey Secret（输入时隐藏）' -AsSecureString
  $secretHandle = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
  $env:ALIYUN_SMS_ACCESS_KEY_SECRET = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretHandle)
  $env:ALIYUN_SMS_SIGN_NAME = Read-Host '输入控制台中已通过的系统签名（例如恒创联众）'
  $env:ALIYUN_SMS_TEMPLATE_CODE = Read-Host '输入配套模板 Code（例如100001）'
  $env:SMS_TEST_PHONE = Read-Host '输入你自己的 11 位中国大陆手机号'

  $confirmSend = Read-Host '将向此号码发送一条正常计费的测试短信。输入 SEND 才发送'
  if ($confirmSend -cne 'SEND') { Write-Host '已取消发送。'; exit 0 }
  node scripts/smoke_aliyun_sms.mjs send
  if ($LASTEXITCODE -ne 0) { throw '发送测试未通过。' }

  $secureCode = Read-Host '输入刚收到的验证码（输入时隐藏）' -AsSecureString
  $codeHandle = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureCode)
  try {
    $env:SMS_TEST_CODE = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($codeHandle)
    node scripts/smoke_aliyun_sms.mjs check
    if ($LASTEXITCODE -ne 0) { throw '核验测试未通过。' }
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($codeHandle)
  }
} finally {
  if ($secretHandle -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretHandle) }
  'ALIYUN_SMS_ACCESS_KEY_ID','ALIYUN_SMS_ACCESS_KEY_SECRET','ALIYUN_SMS_SIGN_NAME',
    'ALIYUN_SMS_TEMPLATE_CODE','SMS_TEST_PHONE','SMS_TEST_CODE' | ForEach-Object {
      Remove-Item -Path "Env:$_" -ErrorAction SilentlyContinue
    }
  Pop-Location
}
