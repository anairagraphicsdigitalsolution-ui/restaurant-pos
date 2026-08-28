$ErrorActionPreference = "Stop"

Write-Host "Anaira POS - Local Supabase Status" -ForegroundColor Cyan
Write-Host ""

# Do NOT call `supabase status` here.
# Supabase CLI may expect project-ref based container names while Docker Compose
# uses the standard local names (supabase-db, supabase-meta, etc.).
$services = @(
    @{ Label = "Database";   Names = @("supabase-db");                    Required = $true  },
    @{ Label = "pgMeta";     Names = @("supabase-meta");                  Required = $true  },
    @{ Label = "Auth";       Names = @("supabase-auth");                  Required = $true  },
    @{ Label = "Storage";    Names = @("supabase-storage");               Required = $true  },
    @{ Label = "Realtime";   Names = @("realtime-dev.supabase-realtime");  Required = $true  },
    @{ Label = "Analytics";  Names = @("supabase-analytics");              Required = $true  },
    @{ Label = "Studio";     Names = @("supabase-studio");                 Required = $false },
    @{ Label = "Kong/API";   Names = @("supabase-kong");                   Required = $true  },
    @{ Label = "REST";       Names = @("supabase-rest");                   Required = $false },
    @{ Label = "Storage Img";Names = @("supabase-imgproxy");               Required = $false },
    @{ Label = "Vector";     Names = @("supabase-vector");                 Required = $false }
)

function Get-ContainerState([string[]]$Names) {
    foreach ($name in $Names) {
        $json = docker inspect $name 2>$null
        if ($LASTEXITCODE -eq 0 -and $json) {
            try {
                $obj = $json | ConvertFrom-Json
                return $obj[0].State
            } catch {}
        }
    }
    return $null
}

$requiredFailed = $false

foreach ($service in $services) {
    $state = Get-ContainerState $service.Names

    if ($null -eq $state) {
        $status = "NOT FOUND"
        if ($service.Required) { $requiredFailed = $true }
    }
    elseif ($state.Health -and $state.Health.Status) {
        $status = $state.Health.Status.ToUpper()
        if ($service.Required -and $status -ne "HEALTHY") { $requiredFailed = $true }
    }
    elseif ($state.Status -eq "running") {
        $status = "RUNNING"
    }
    else {
        $status = $state.Status.ToUpper()
        if ($service.Required) { $requiredFailed = $true }
    }

    $pad = $service.Label.PadRight(14)
    Write-Host ("{0}: {1}" -f $pad, $status)
}

Write-Host ""
if ($requiredFailed) {
    Write-Host "LOCAL SUPABASE: NOT READY" -ForegroundColor Red
    exit 1
} else {
    Write-Host "LOCAL SUPABASE: READY" -ForegroundColor Green
    exit 0
}
