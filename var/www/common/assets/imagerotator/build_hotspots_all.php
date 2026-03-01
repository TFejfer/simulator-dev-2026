<?php
declare(strict_types=1);

/**
 * build_hotspots_all.php
 *
 * Converts legacy hotspot XMLs to 1 JSON per theme.
 *
 * Usage:
 *   php build_hotspots_all.php \
 *     --in=/path/to/hotspot-xml \
 *     --out=/var/www/common/assets/imagerotator/hotspots
 *
 * Expected input files:
 *   action010000en.xml ... action090000en.xml
 *
 * Output:
 *   theme_01.json ... theme_09.json
 */

function fail(string $msg, int $code = 1): void {
    fwrite(STDERR, "ERROR: {$msg}\n");
    exit($code);
}

function arg(string $name, array $argv): ?string {
    foreach ($argv as $a) {
        if (str_starts_with($a, "--{$name}=")) return substr($a, strlen($name) + 3);
    }
    return null;
}

function loadXml(string $path): DOMDocument {
    if (!is_file($path)) fail("Missing file: {$path}");
    $xml = file_get_contents($path);
    if ($xml === false) fail("Could not read: {$path}");

    libxml_use_internal_errors(true);
    $doc = new DOMDocument();
    if (!$doc->loadXML($xml)) {
        $errs = libxml_get_errors();
        $msg = $errs ? trim($errs[0]->message) : 'Unknown XML parse error';
        fail("XML parse failed for {$path}: {$msg}");
    }
    return $doc;
}

function extractFrames(DOMDocument $doc, int $expectedFrames = 60): array {
    $xp = new DOMXPath($doc);

    // Most common: <config><images><image ...>
    $images = $xp->query('//config/images/image');
    if (!$images || $images->length === 0) {
        // Fallback: <images><image ...>
        $images = $xp->query('//images/image');
    }
    if (!$images || $images->length === 0) fail("No <image> nodes found in XML.");

    $frames = [];
    foreach ($images as $imgNode) {
        if (!$imgNode instanceof DOMElement) continue;

        $hs = [];
        $hotspotNodes = $imgNode->getElementsByTagName('hotspot');
        foreach ($hotspotNodes as $hNode) {
            if (!$hNode instanceof DOMElement) continue;

            $id = trim((string)$hNode->getAttribute('source'));
            if ($id === '') continue;

            $x = (int)$hNode->getAttribute('offsetX');
            $y = (int)$hNode->getAttribute('offsetY');

            $hs[] = ['id' => $id, 'x' => $x, 'y' => $y];
        }
        $frames[] = $hs;
    }

    if (count($frames) !== $expectedFrames) {
        fwrite(STDERR, "WARN: Expected {$expectedFrames} frames, found ".count($frames)."\n");
    }

    return $frames;
}

$inDir  = arg('in', $argv);
$outDir = arg('out', $argv);

if (!$inDir || !is_dir($inDir)) fail("Missing/invalid --in directory");
if (!$outDir || !is_dir($outDir)) fail("Missing/invalid --out directory");

$files = [
    '01' => 'action010000en.xml',
    '02' => 'action020000en.xml',
    '03' => 'action030000en.xml',
    '04' => 'action040000en.xml',
    '05' => 'action050000en.xml',
    '06' => 'action060000en.xml',
    '07' => 'action070000en.xml',
    '08' => 'action080000en.xml',
    '09' => 'action090000en.xml',
];

$refW = 960;
$refH = 540;

foreach ($files as $theme => $file) {
    $path = rtrim($inDir, '/').'/'.$file;

    $doc = loadXml($path);
    $frames = extractFrames($doc, 60);

    $out = [
        'version'  => 1,
        'theme_id' => (int)$theme,
        'ref'      => ['w' => $refW, 'h' => $refH],
        'frames'   => count($frames),
        'hotspots' => $frames,
    ];

    $json = json_encode($out, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) fail("json_encode failed for theme {$theme}");

    $outFile = rtrim($outDir, '/')."/theme_{$theme}.json";
    if (file_put_contents($outFile, $json) === false) fail("Could not write: {$outFile}");

    echo "OK: theme {$theme} -> {$outFile}\n";
}

echo "DONE\n";