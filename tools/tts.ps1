param([string]$Json, [string]$OutDir)
# Windows 내장 한국어 음성(Heami)으로 문장별 wav를 만든다.
Add-Type -AssemblyName System.Speech
$items = Get-Content -Raw -Encoding UTF8 $Json | ConvertFrom-Json
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice("Microsoft Heami Desktop")
$s.Rate = -2
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
foreach ($it in $items) {
  $path = Join-Path $OutDir $it.file
  if (Test-Path $path) { continue }
  $s.SetOutputToWaveFile($path, $fmt)
  $s.Speak($it.text)
  $s.SetOutputToNull()
}
