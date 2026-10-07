param(
    [string]$OutputPath = "ChatGPTWeb/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$destination = Join-Path $root $OutputPath
$directory = Split-Path -Parent $destination
New-Item -ItemType Directory -Force -Path $directory | Out-Null

$bitmap = [System.Drawing.Bitmap]::new(
    1024,
    1024,
    [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

try {
    $backgroundBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(20, 33, 61))
    $ringPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(46, 196, 182), 72)
    $linePen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 64)
    $accentBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 191, 105))
    $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $graphics.FillRectangle($backgroundBrush, 0, 0, 1024, 1024)
    $graphics.DrawEllipse($ringPen, 212, 212, 600, 600)
    foreach ($line in @(
        @{ X1 = 330; Y = 388; X2 = 694 },
        @{ X1 = 330; Y = 512; X2 = 694 },
        @{ X1 = 330; Y = 636; X2 = 694 }
    )) {
        $graphics.DrawLine($linePen, $line.X1, $line.Y, $line.X2, $line.Y)
    }
    foreach ($point in @(
        @{ X = 360; Y = 358 },
        @{ X = 560; Y = 482 },
        @{ X = 440; Y = 606 }
    )) {
        $graphics.FillEllipse($accentBrush, $point.X, $point.Y, 60, 60)
    }

    $bitmap.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
    $accentBrush.Dispose()
    $linePen.Dispose()
    $ringPen.Dispose()
    $backgroundBrush.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

Write-Output "Generated App Icon: $destination"

