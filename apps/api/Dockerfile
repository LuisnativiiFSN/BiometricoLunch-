# escape=`

# La imagen se construye desde C:\Users\dev05\Desktop\MarcacionComida:
# docker build -f BiometricoLunch-/apps/api/Dockerfile -t 10.0.40.10:5000/app-comedor-fsn-api:1.0.0 .

ARG NODE_VERSION=24.18.1

FROM mcr.microsoft.com/dotnet/runtime:10.0-windowsservercore-ltsc2022 AS windows-node
ARG NODE_VERSION
SHELL ["powershell", "-NoLogo", "-NoProfile", "-Command"]

RUN $ErrorActionPreference = 'Stop'; `
    $ProgressPreference = 'SilentlyContinue'; `
    $archive = "node-v$env:NODE_VERSION-win-x64.zip"; `
    New-Item -ItemType Directory -Path C:\node-download | Out-Null; `
    Invoke-WebRequest "https://nodejs.org/dist/v$env:NODE_VERSION/$archive" -OutFile "C:\node-download\$archive"; `
    Invoke-WebRequest "https://nodejs.org/dist/v$env:NODE_VERSION/SHASUMS256.txt" -OutFile C:\node-download\SHASUMS256.txt; `
    $checksumLine = (Select-String -Path C:\node-download\SHASUMS256.txt -Pattern ([regex]::Escape($archive) + '$')).Line; `
    if (-not $checksumLine) { throw 'No se encontro el checksum oficial de Node.js' }; `
    $expected = ($checksumLine -split '\s+')[0].ToLowerInvariant(); `
    $actual = (Get-FileHash "C:\node-download\$archive" -Algorithm SHA256).Hash.ToLowerInvariant(); `
    if ($actual -ne $expected) { throw 'El checksum de Node.js no coincide' }; `
    Expand-Archive "C:\node-download\$archive" -DestinationPath C:\node-download; `
    Move-Item "C:\node-download\node-v$env:NODE_VERSION-win-x64" C:\node; `
    Remove-Item C:\node-download -Recurse -Force

ENV PATH="C:\node;${PATH}"

FROM mcr.microsoft.com/dotnet/sdk:10.0-windowsservercore-ltsc2022 AS matcher-build
SHELL ["powershell", "-NoLogo", "-NoProfile", "-Command"]

COPY ["SDK/DP_Bio_SDK_3.6.0.307/SDK/x64/", "C:/installers/digitalpersona-sdk/"]
RUN $ErrorActionPreference = 'Stop'; `
    $installer = Start-Process C:\installers\digitalpersona-sdk\setup.exe `
      -ArgumentList '/s', '/v"REBOOT=ReallySuppress /qn"' `
      -Wait -PassThru; `
    if ($installer.ExitCode -notin @(0, 3010)) { throw "Fallo la instalacion del SDK DigitalPersona: $($installer.ExitCode)" }

WORKDIR C:\src
COPY ["Csharp/MarcacionComida.BiometricMatcher/", "C:/src/MarcacionComida.BiometricMatcher/"]
RUN dotnet restore C:\src\MarcacionComida.BiometricMatcher\MarcacionComida.BiometricMatcher.csproj -r win-x64; `
    dotnet publish C:\src\MarcacionComida.BiometricMatcher\MarcacionComida.BiometricMatcher.csproj `
      -c Release -r win-x64 --self-contained false --no-restore -o C:\out\matcher

FROM windows-node AS api-build
SHELL ["powershell", "-NoLogo", "-NoProfile", "-Command"]

RUN npm install --global --prefix C:\pnpm pnpm@11.19.0
ENV PATH="C:\pnpm;C:\node;${PATH}"

WORKDIR C:\src\BiometricoLunch-
COPY ["BiometricoLunch-/package.json", "BiometricoLunch-/pnpm-lock.yaml", "BiometricoLunch-/pnpm-workspace.yaml", "./"]
COPY ["BiometricoLunch-/apps/api/package.json", "apps/api/package.json"]
RUN pnpm install --frozen-lockfile --filter @comedor/api...

COPY ["BiometricoLunch-/apps/api/", "apps/api/"]
ENV DATABASE_URL="sqlserver://localhost:1433;database=build;user=build;password=BuildOnly123!;encrypt=true;trustServerCertificate=true"
RUN pnpm --filter @comedor/api prisma:generate; `
    pnpm --filter @comedor/api build; `
    pnpm --filter @comedor/api deploy --prod --legacy C:\out\api

FROM windows-node AS runtime
SHELL ["powershell", "-NoLogo", "-NoProfile", "-Command"]

# Se instala solamente el Runtime (RTE) necesario en produccion, no el SDK de desarrollo.
COPY ["SDK/DP_Bio_SDK_3.6.0.307/RTE/x64/", "C:/installers/digitalpersona-rte/"]
RUN $ErrorActionPreference = 'Stop'; `
    $installer = Start-Process C:\installers\digitalpersona-rte\setup.exe `
      -ArgumentList '/s', '/v"ADDLOCAL=AlwaysInstalled,DotNet REBOOT=ReallySuppress /qn"' `
      -Wait -PassThru; `
    if ($installer.ExitCode -notin @(0, 3010)) { throw "Fallo la instalacion del Runtime DigitalPersona: $($installer.ExitCode)" }; `
    Remove-Item C:\installers -Recurse -Force

WORKDIR C:\app\api
COPY --from=api-build C:/out/api/ C:/app/api/
COPY --from=matcher-build C:/out/matcher/ C:/app/matcher/

ENV NODE_ENV=production `
    PORT=3000 `
    BIOMETRIC_MATCHER_PATH="C:\app\matcher\MarcacionComida.BiometricMatcher.exe"

EXPOSE 3000
USER ContainerUser
ENTRYPOINT ["C:\\node\\node.exe", "dist\\main.js"]
