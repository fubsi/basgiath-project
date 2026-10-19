Add-Type -AssemblyName System.IO.Compression.FileSystem

$modsDir = "S:\CurseForge\Instances\All the Mods 11 - ATM11\mods"
$vanillaJar = "S:\CurseForge\Install\versions\26.1.2\26.1.2.jar"
$outDir = "c:\Users\fbrze\Documents\Git\basgiath-project\frontend\public\textures\blocks"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$chiselJar = Join-Path $modsDir "chisel-26.1.2.19.jar"
$iafJar = Join-Path $modsDir "iceandfire-2.2-beta.4.jar"
$faJar = Join-Path $modsDir "forbidden_arcanus-26.1.2-2.8.0-beta.2.jar"
$ruJar = Join-Path $modsDir "regions-unexplored-0.7.0+beta2-neoforge.jar"
$fbJar = Join-Path $modsDir "FramedBlocks-11.4.0.jar"

function Extract-Texture($jarPath, $entryPattern, $destName) {
  if (-not (Test-Path $jarPath)) {
    Write-Warning "Jar not found: $jarPath"
    return $false
  }
  $zip = [System.IO.Compression.ZipFile]::OpenRead($jarPath)
  try {
    $entry = $zip.Entries | Where-Object { $_.FullName -like $entryPattern -and $_.FullName -like "*.png" -and $_.FullName -notlike "*.mcmeta" } | Select-Object -First 1
    if ($null -ne $entry) {
      $destPath = Join-Path $outDir $destName
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destPath, $true)
      Write-Host "Extracted [$destName] <- $($entry.FullName)"
      return $true
    } else {
      Write-Warning "No match for $entryPattern in $jarPath"
      return $false
    }
  } finally {
    $zip.Dispose()
  }
}

# 1: minecraft:deepslate_bricks
Extract-Texture $vanillaJar "assets/minecraft/textures/block/deepslate_bricks.png" "deepslate_bricks.png"

# 2: forbidden_arcanus:arcane_polished_darkstone (Riders Quadrant Dark Fortress Stone)
Extract-Texture $faJar "assets/forbidden_arcanus/textures/block/arcane_polished_darkstone.png" "arcane_polished_darkstone.png"

# 3: minecraft:polished_blackstone_bricks
Extract-Texture $vanillaJar "assets/minecraft/textures/block/polished_blackstone_bricks.png" "polished_blackstone_bricks.png"

# 4: chisel:andesite_bricks (South Campus Main Facade)
Extract-Texture $chiselJar "assets/chisel/textures/block/andesite/*bricks_solid.png" "chisel_andesite_bricks.png"

# 5: minecraft:stone_bricks
Extract-Texture $vanillaJar "assets/minecraft/textures/block/stone_bricks.png" "stone_bricks.png"

# 6: chisel:limestone_bricks (Healer & Scribe Quadrant Vaults)
Extract-Texture $chiselJar "assets/chisel/textures/block/limestone/limestone_bricks_solid.png" "chisel_limestone_bricks.png"

# 7: chisel:bookshelf_historian (Scribe Archive Bookshelves)
Extract-Texture $chiselJar "assets/chisel/textures/block/bookshelf/bookshelf_historian.png" "chisel_bookshelf_historian.png"

# 8: minecraft:deepslate_tiles (Steep Slate Roofs / Macaw's Deepslate Roofs)
Extract-Texture $vanillaJar "assets/minecraft/textures/block/deepslate_tiles.png" "deepslate_tiles.png"

# 9: chisel:steel (Rotunda Dome Ribs & Ironwork)
Extract-Texture $chiselJar "assets/chisel/textures/block/steel/*bolted*.png" "chisel_steel_bolted.png"

# 10: chisel:steel_framed_stained_glass_black (Rotunda Dome Tinted Glass)
Extract-Texture $chiselJar "assets/chisel/textures/block/steel_framed_stained_glass_black/steel_framed_stained_glass_black_diamond.png" "chisel_glass_black.png"

# 11: chisel:dark_oak_planks (Amphitheater Benches & Tables)
Extract-Texture $chiselJar "assets/chisel/textures/block/dark_oak_planks/*paneling*.png" "chisel_dark_oak.png"

# 12: forbidden_arcanus:arcane_crystal_block (Floating Magelights)
Extract-Texture $faJar "assets/forbidden_arcanus/textures/block/arcane_crystal_block.png" "arcane_crystal_block.png"

# 13: chisel:bronze_bolted (Mechanical Cogwheels & Bell Mechanism)
Extract-Texture $chiselJar "assets/chisel/textures/block/bronze/bronze_bolted.png" "chisel_bronze_bolted.png"

# 14: iceandfire:dragonscale_black (Schwarzer Drache / Tairn / Morningstail)
Extract-Texture $iafJar "assets/iceandfire/textures/block/dragonscale_black.png" "dragonscale_black.png"

# 15: iceandfire:dragonscale_blue (Blauer Drache / Sgaeyl / Daggertail)
Extract-Texture $iafJar "assets/iceandfire/textures/block/dragonscale_blue.png" "dragonscale_blue.png"

# 16: iceandfire:dragonscale_green (Grüner Drache / Teine / Clubtail)
Extract-Texture $iafJar "assets/iceandfire/textures/block/dragonscale_green.png" "dragonscale_green.png"

# 17: iceandfire:dragonscale_red (Roter Drache / Thoirt / Swordtail)
Extract-Texture $iafJar "assets/iceandfire/textures/block/dragonscale_red.png" "dragonscale_red.png"

# 18: iceandfire:dragonscale_copper (Oranger Drache / Baide / Scorpiontail)
Extract-Texture $iafJar "assets/iceandfire/textures/block/dragonscale_copper.png" "dragonscale_copper.png"

# 19: iceandfire:dragonscale_bronze (Brauner Drache / Deigh / Feathertail)
Extract-Texture $iafJar "assets/iceandfire/textures/block/dragonscale_bronze.png" "dragonscale_bronze.png"

# 20: chisel:gold (Andarna / Goldene Statuen-Akzente)
Extract-Texture $chiselJar "assets/chisel/textures/block/gold/*bricks*.png" "chisel_gold.png"

# 21: minecraft:water_still (Reißender Schlucht-Fluss)
Extract-Texture $vanillaJar "assets/minecraft/textures/block/blue_ice.png" "water_river.png"

# 22: minecraft:tuff (Schlucht- & Klippenfels)
Extract-Texture $vanillaJar "assets/minecraft/textures/block/tuff.png" "tuff.png"

# 23: regions_unexplored:alpha_grass_block_top (Gebirgswiese & Fields)
Extract-Texture $ruJar "assets/regions_unexplored/textures/block/alpha_grass_block_top.png" "grass_fields.png"

# 24: framedblocks:framed_block (Framed Slope / Parapet)
Extract-Texture $vanillaJar "assets/minecraft/textures/block/cracked_stone_bricks.png" "parapet_stone.png"

# 25: chisel:mossy_deepslate (Tiefer Schluchtfels)
Extract-Texture $chiselJar "assets/chisel/textures/block/mossy_deepslate/mossy_deepslate_bricks_rough.png" "mossy_deepslate.png"

# 26: minecraft:calcite (Hochgebirgs-Kalkstein & Schneegipfel)
Extract-Texture $vanillaJar "assets/minecraft/textures/block/calcite.png" "calcite.png"

# 27: regions_unexplored:forest_leaves (Bergwald)
Extract-Texture $faJar "assets/forbidden_arcanus/textures/block/aurum_leaves.png" "mountain_leaves.png"
