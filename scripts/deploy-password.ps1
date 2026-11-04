param([Parameter(Mandatory)][ValidateSet('get', 'prompt', 'save', 'clear')][string]$Mode)

# รหัสผ่านที่บันทึกไว้ถูกเข้ารหัสด้วย Windows DPAPI ผูกกับผู้ใช้ Windows นี้บนเครื่องนี้เท่านั้น
# เก็บนอกโฟลเดอร์โปรเจกต์ จึงไม่ถูก commit ขึ้น GitHub
$credFile = Join-Path $env:USERPROFILE '.hp-registry-deploy.cred'

function ConvertTo-PlainText([securestring]$Secure) {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure))
}

switch ($Mode) {
    'get' {
        if (Test-Path $credFile) {
            try { ConvertTo-PlainText ((Get-Content $credFile -Raw).Trim() | ConvertTo-SecureString) } catch { }
        }
    }
    'prompt' {
        $secure = Read-Host "กรอกรหัสผ่าน SSH ของผู้ใช้ $($env:DEPLOY_USER)" -AsSecureString
        $plain = ConvertTo-PlainText $secure
        [Console]::Error.WriteLine("รับรหัสผ่านแล้ว $($plain.Length) ตัวอักษร")
        if ($plain -match '[^\x20-\x7E]') {
            [Console]::Error.WriteLine('คำเตือน: รหัสผ่านมีตัวอักษรที่ไม่ใช่ภาษาอังกฤษ/สัญลักษณ์ปกติ สลับแป้นพิมพ์เป็น EN (Win + Space) แล้วรันใหม่')
        }
        $plain
    }
    'save' {
        ConvertTo-SecureString $env:DEPLOY_PASSWORD -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -Path $credFile
    }
    'clear' {
        Remove-Item $credFile -ErrorAction SilentlyContinue
    }
}
