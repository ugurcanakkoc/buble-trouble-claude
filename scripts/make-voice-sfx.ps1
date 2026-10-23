# Regenerates the chipmunk "YARDIM" voice clips in public/sfx/ (used by src/ui/voice.ts).
# Needs: Windows 10/11 with the OneCore "Microsoft Tolga" (tr-TR) voice + ffmpeg (libopus, libmp3lame) on PATH.
# Run:   powershell -ExecutionPolicy Bypass -File scripts/make-voice-sfx.ps1
# Chain: Tolga TTS via SSML (pitch +30%, rate +10%, last word pitched up = rising, pleading end)
#        -> ffmpeg: trim lead/tail silence -> "tape speed-up" asetrate x1.75 (pitch AND formants up = Alvin)
#        -> atempo 0.8 (net speed x1.4) -> vibrato 6.5 Hz / depth 0.12 (bouncy wobble) -> highpass 180 Hz
#        -> loudnorm -16 LUFS -> mono 48 kHz -> Opus 32 kb/s .webm + MP3 40 kb/s fallback (iOS Safari).
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root 'public/sfx'
New-Item -ItemType Directory -Force $out | Out-Null
$tmp = Join-Path ([IO.Path]::GetTempPath()) 'voice-sfx'
New-Item -ItemType Directory -Force $tmp | Out-Null

# file name -> SSML body (the <prosody> on the last word gives the cute rising end)
$lines = [ordered]@{
  'yardim-1' = 'Yardım et! <prosody pitch="+25%">Yardım et!</prosody>'
  'yardim-2' = 'İm<prosody pitch="+20%" rate="-30%">daaat!</prosody>'
  'yardim-3' = 'Kurtarın <prosody pitch="+25%">beni!</prosody>'
  'yardim-4' = 'Hadi <prosody pitch="+30%" rate="-20%">amaaa!</prosody>'
}

$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(); $task.Result }

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$synth.Voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.Language -eq 'tr-TR' } | Select-Object -First 1
if (-not $synth.Voice) { throw 'No tr-TR OneCore voice (Microsoft Tolga) installed.' }

$af = 'silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_threshold=-45dB:stop_duration=0.15,' +
      'asetrate=22050*1.75,aresample=48000,atempo=0.8,vibrato=f=6.5:d=0.12,highpass=f=180,loudnorm=I=-16:TP=-1.5:LRA=11'

foreach ($name in $lines.Keys) {
  $ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='tr-TR'><prosody pitch='+30%' rate='+10%'>$($lines[$name])</prosody></speak>"
  $stream = Await ($synth.SynthesizeSsmlToStreamAsync($ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $n = [uint32]$stream.Size
  $null = Await ($reader.LoadAsync($n)) ([uint32])
  $bytes = New-Object byte[] $n
  $reader.ReadBytes($bytes)
  $wav = Join-Path $tmp "$name.wav"
  [IO.File]::WriteAllBytes($wav, $bytes)
  # resample to a known rate first so asetrate's factor is exact regardless of the TTS output rate
  ffmpeg -hide_banner -loglevel error -y -i $wav -ac 1 -ar 22050 "$tmp/$name-22k.wav"
  ffmpeg -hide_banner -loglevel error -y -i "$tmp/$name-22k.wav" -af $af -ac 1 -ar 48000 -c:a libopus -b:a 32k "$out/$name.webm"
  ffmpeg -hide_banner -loglevel error -y -i "$tmp/$name-22k.wav" -af $af -ac 1 -ar 44100 -c:a libmp3lame -b:a 40k "$out/$name.mp3"
  Write-Host "$name done"
}
Get-ChildItem $out | Select-Object Name, Length
