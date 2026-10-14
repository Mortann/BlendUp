param([Parameter(Mandatory=$true)][string]$Payload, [string]$RequestFile, [switch]$NonInteractive)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$metadata = Get-Content -Raw -Encoding UTF8 (Join-Path $Payload 'update.json') | ConvertFrom-Json
$logDirectory = Join-Path $env:LOCALAPPDATA 'BlendUp/update-logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$logPath = Join-Path $logDirectory ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N') + '.log')

function Invoke-UpdateProcess([string]$Executable, [string]$Arguments, [int]$Timeout = 600) {
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $Executable
    $start.Arguments = $Arguments
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $process = [System.Diagnostics.Process]::Start($start)
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    while (!$process.HasExited) {
        [System.Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 100
        if ($watch.Elapsed.TotalSeconds -gt $Timeout) { $process.Kill(); $process.WaitForExit(); throw "Le processus de mise à jour ne répond pas : $Executable" }
    }
    return $process.ExitCode
}

function Installed-Directory {
    foreach ($hive in @([Microsoft.Win32.Registry]::CurrentUser, [Microsoft.Win32.Registry]::LocalMachine)) {
        $key = $hive.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Uninstall\BlendUp')
        if ($key) {
            try {
                # Tauri NSIS stores its install path in the key's default value.
                foreach ($location in @($key.GetValue('InstallLocation'), $key.GetValue(''))) {
                    if ($location -and (Test-Path -LiteralPath (Join-Path $location 'blendup.exe'))) { return $location }
                }
            } finally { $key.Dispose() }
        }
    }
    return Join-Path $env:LOCALAPPDATA 'BlendUp'
}

function Godot-Project([string]$Root) {
    try {
        $project = Get-Content -Raw -Encoding UTF8 (Join-Path $Root '.blendup/project.json') | ConvertFrom-Json
        $engine = if ($project.engine) { $project.engine } elseif ($project.paths.godotRoot) { 'godot' } else { 'unity' }
        if ($engine -ne 'godot') { return $false }
        $engineRoot = if ($project.paths.engineRoot) { $project.paths.engineRoot } elseif ($project.paths.godotRoot) { $project.paths.godotRoot } else { 'Godot' }
        return Test-Path -LiteralPath (Join-Path $Root "$engineRoot/addons/blendup/plugin.cfg")
    } catch { return $false }
}

function Choose-Update {
    $settingsPath = Join-Path $env:APPDATA 'BlendUp/user-settings.json'
    $settings = $null
    if (Test-Path -LiteralPath $settingsPath) { $settings = Get-Content -Raw -Encoding UTF8 $settingsPath | ConvertFrom-Json }
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "Mettre à jour BlendUp $($metadata.version)"
    $form.ClientSize = New-Object System.Drawing.Size(730, 480)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $font = New-Object System.Drawing.Font('Segoe UI', 10)
    $form.Font = $font
    function Label([string]$Text, [int]$Y) {
        $label = New-Object System.Windows.Forms.Label
        $label.Text = $Text; $label.Location = New-Object System.Drawing.Point(20, $Y)
        $label.Size = New-Object System.Drawing.Size(690, 40); $form.Controls.Add($label)
    }
    Label 'Enregistre ton travail, puis ferme BlendUp, Blender et Godot avant de continuer.' 15
    Label 'Installation actuelle de BlendUp' 60
    $app = New-Object System.Windows.Forms.TextBox
    $app.Location = New-Object System.Drawing.Point(20, 88); $app.Size = New-Object System.Drawing.Size(590, 28)
    $app.Text = Installed-Directory; $form.Controls.Add($app)
    $browseApp = New-Object System.Windows.Forms.Button
    $browseApp.Text = 'Parcourir'; $browseApp.Location = New-Object System.Drawing.Point(620, 86); $browseApp.Size = New-Object System.Drawing.Size(90, 30)
    $browseApp.Add_Click({ $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; if ($dialog.ShowDialog() -eq 'OK') { $app.Text = $dialog.SelectedPath }; $dialog.Dispose() }.GetNewClosure()); $form.Controls.Add($browseApp)
    $blenderCheck = New-Object System.Windows.Forms.CheckBox
    $blenderCheck.Text = "Mettre à jour l'addon Blender ($($metadata.blenderAddonVersion))"; $blenderCheck.Checked = $true
    $blenderCheck.Location = New-Object System.Drawing.Point(20, 130); $blenderCheck.Size = New-Object System.Drawing.Size(600, 25); $form.Controls.Add($blenderCheck)
    $blender = New-Object System.Windows.Forms.TextBox
    $blender.Location = New-Object System.Drawing.Point(20, 162); $blender.Size = New-Object System.Drawing.Size(590, 28)
    $candidates = @($settings.blenderPath, $env:BLENDER_PATH,
        "${env:ProgramFiles(x86)}\Steam\steamapps\common\Blender\blender.exe",
        "$env:ProgramFiles\Steam\steamapps\common\Blender\blender.exe")
    $candidates += @(Get-ChildItem "$env:ProgramFiles\Blender Foundation" -Filter blender.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
    $blender.Text = [string](@($candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1)[0])
    $form.Controls.Add($blender)
    $browseBlender = New-Object System.Windows.Forms.Button
    $browseBlender.Text = 'Parcourir'; $browseBlender.Location = New-Object System.Drawing.Point(620, 160); $browseBlender.Size = New-Object System.Drawing.Size(90, 30)
    $browseBlender.Add_Click({ $dialog = New-Object System.Windows.Forms.OpenFileDialog; $dialog.Filter = 'Blender (blender.exe)|blender.exe'; if ($dialog.ShowDialog() -eq 'OK') { $blender.Text = $dialog.FileName }; $dialog.Dispose() }.GetNewClosure()); $form.Controls.Add($browseBlender)
    Label 'Addon Godot : coche les projets à mettre à jour.' 210
    $projects = New-Object System.Windows.Forms.CheckedListBox
    $projects.Location = New-Object System.Drawing.Point(20, 240); $projects.Size = New-Object System.Drawing.Size(590, 140); $projects.CheckOnClick = $true
    foreach ($root in @(@($settings.lastProjectRoot) + @($settings.recentProjects) | Where-Object { $_ } | Select-Object -Unique)) {
        if (Godot-Project $root) { [void]$projects.Items.Add($root, $true) }
    }
    $form.Controls.Add($projects)
    $add = New-Object System.Windows.Forms.Button
    $add.Text = 'Ajouter'; $add.Location = New-Object System.Drawing.Point(620, 240); $add.Size = New-Object System.Drawing.Size(90, 30)
    $add.Add_Click({
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = 'Choisir la racine du projet BlendUp (contenant Art et .blendup).'
        if ($dialog.ShowDialog() -eq 'OK') {
            if (!(Godot-Project $dialog.SelectedPath)) { [void][System.Windows.Forms.MessageBox]::Show("L'addon BlendUp n'est pas installé dans le projet Godot associé.", 'Projet Godot') }
            elseif (!$projects.Items.Contains($dialog.SelectedPath)) { [void]$projects.Items.Add($dialog.SelectedPath, $true) }
        }
        $dialog.Dispose()
    }.GetNewClosure()); $form.Controls.Add($add)
    Label 'Les préférences sont conservées. Une copie des versions remplacées est sauvegardée.' 390
    $confirm = New-Object System.Windows.Forms.Button
    $confirm.Text = 'Mettre à jour'; $confirm.Location = New-Object System.Drawing.Point(485, 435); $confirm.Size = New-Object System.Drawing.Size(130, 30)
    $confirm.Add_Click({
        if (!(Test-Path -LiteralPath (Join-Path $app.Text 'blendup.exe') -PathType Leaf)) { [void][System.Windows.Forms.MessageBox]::Show('Choisis le dossier de BlendUp déjà installé. Pour une première installation, utilise le setup.', 'BlendUp'); return }
        if ($blenderCheck.Checked -and !(Test-Path -LiteralPath $blender.Text -PathType Leaf)) { [void][System.Windows.Forms.MessageBox]::Show('Choisis blender.exe ou décoche la mise à jour de son addon.', 'Blender'); return }
        $form.DialogResult = 'OK'; $form.Close()
    }.GetNewClosure()); $form.Controls.Add($confirm)
    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = 'Annuler'; $cancel.DialogResult = 'Cancel'; $cancel.Location = New-Object System.Drawing.Point(625, 435); $cancel.Size = New-Object System.Drawing.Size(85, 30)
    $form.CancelButton = $cancel; $form.Controls.Add($cancel)
    $answer = $form.ShowDialog()
    $request = @{ installDirectory = $app.Text; blenderPath = $(if ($blenderCheck.Checked) { $blender.Text } else { $null }); projectRoots = @($projects.CheckedItems | ForEach-Object { [string]$_ }) }
    $form.Dispose(); $font.Dispose()
    if ($answer -ne 'OK') { return $null }
    return $request
}

try {
    if ($NonInteractive -and !$RequestFile) { throw 'Le mode automatisé nécessite un fichier /REQUEST.' }
    if ($RequestFile) { $request = Get-Content -Raw -Encoding UTF8 $RequestFile | ConvertFrom-Json }
    else { $request = Choose-Update }
    if (!$request) { exit 2 }
    $open = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '^(blendup|blender|godot.*)$' })
    if ($open.Count) { throw 'Enregistre ton travail et ferme BlendUp, Blender et Godot, puis relance la mise à jour.' }
    $installDirectory = [System.IO.Path]::GetFullPath($request.installDirectory)
    $installed = Join-Path $installDirectory 'blendup.exe'
    if (!(Test-Path -LiteralPath $installed -PathType Leaf)) { throw 'Installation actuelle de BlendUp introuvable.' }
    if ($request.blenderPath -and !(Test-Path -LiteralPath $request.blenderPath -PathType Leaf)) { throw 'Blender est introuvable.' }
    $session = if ($request.backupDirectory) { [System.IO.Path]::GetFullPath($request.backupDirectory) } else { Join-Path $env:LOCALAPPDATA ('BlendUp/update-backups/' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N')) }
    if (Test-Path -LiteralPath $session) { throw 'Le dossier de sauvegarde doit être nouveau.' }
    New-Item -ItemType Directory -Path (Join-Path $session 'application') -Force | Out-Null
    Copy-Item -LiteralPath $installed -Destination (Join-Path $session 'application/blendup.exe')
    $settingsPath = Join-Path $env:APPDATA 'BlendUp/user-settings.json'
    if (Test-Path -LiteralPath $settingsPath) { Copy-Item -LiteralPath $settingsPath -Destination (Join-Path $session 'application/user-settings.json') }
    $applicationResult = Invoke-UpdateProcess (Join-Path $Payload 'setup.exe') ("/S /D=$installDirectory")
    if ($applicationResult -ne 0) { throw "L'installateur BlendUp a échoué (code $applicationResult). Les addons n'ont pas été modifiés. Sauvegarde : $session" }
    $addonRequest = @{ blenderPath = $request.blenderPath; blenderArchive = (Join-Path $Payload 'blendup.zip'); projectRoots = @($request.projectRoots); backupRoot = (Join-Path $session 'addons') }
    $addonRequestFile = Join-Path $session 'request.json'
    $reportFile = Join-Path $session 'report.json'
    [System.IO.File]::WriteAllText($addonRequestFile, ($addonRequest | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))
    $addonResult = Invoke-UpdateProcess (Join-Path $Payload 'blendup.exe') ('--update-addons "' + $addonRequestFile + '" "' + $reportFile + '"')
    if (!(Test-Path -LiteralPath $reportFile)) { throw "Le rapport de mise à jour est absent. Sauvegarde : $session" }
    $report = Get-Content -Raw -Encoding UTF8 $reportFile | ConvertFrom-Json
    $lines = @("Application BlendUp $($metadata.version) : mise à jour.")
    foreach ($component in $report.components) { $lines += "$($component.path) : $($component.message)" }
    if ($report.error) { $lines += $report.error }
    $lines += "Sauvegarde et rapport : $session"
    if (!$NonInteractive) {
        $title = if ($addonResult -eq 0 -and $report.success) { 'Mise à jour terminée' } else { 'Mise à jour partielle' }
        [void][System.Windows.Forms.MessageBox]::Show(($lines -join "`r`n"), $title)
    }
    if ($addonResult -ne 0 -or !$report.success) { exit 1 }
    exit 0
} catch {
    $_ | Out-String | Set-Content -LiteralPath $logPath -Encoding UTF8
    if (!$NonInteractive) { [void][System.Windows.Forms.MessageBox]::Show(($_.Exception.Message + "`r`nJournal : $logPath"), 'Mise à jour interrompue') }
    Write-Error $_.Exception.Message
    exit 1
}
