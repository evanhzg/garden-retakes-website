// Pull CS2's own map-select screenshots out of the game's VPK and write them as
// PNGs.
//
// The site has been showing radars as "map previews" — public/maps/*.png are
// byte-identical copies of public/radars/*.png. A radar is a diagram, not a
// picture of the map, and it is what the map picker has always looked wrong
// with. CS2 ships the real thing at
// panorama/images/map_icons/screenshots/1080p/<map>_png.vtex_c, which is a
// Source 2 compiled texture; this decodes it.

using SkiaSharp;
using SteamDatabase.ValvePak;
using ValveResourceFormat;
using ValveResourceFormat.ResourceTypes;

var vpkPath = args.Length > 0
    ? args[0]
    : "/home/evan/Steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/pak01_dir.vpk";
var outDir = args.Length > 1 ? args[1] : "out";

string[] maps =
[
    "de_ancient", "de_anubis", "de_cache", "de_dust2", "de_inferno",
    "de_mirage", "de_nuke", "de_overpass", "de_train", "de_vertigo",
];

Directory.CreateDirectory(outDir);

using var package = new Package();
package.Read(vpkPath);

foreach (var map in maps)
{
    // The unsuffixed name is the establishing shot the map picker leads with;
    // _1.._4 are the alternates it cycles. One picture per map is what a
    // preview is.
    var path = $"panorama/images/map_icons/screenshots/1080p/{map}_png.vtex_c";
    var entry = package.FindEntry(path);
    if (entry is null)
    {
        Console.WriteLine($"{map,-14} MISSING  ({path})");
        continue;
    }

    package.ReadEntry(entry, out var bytes);

    using var resource = new Resource();
    resource.Read(new MemoryStream(bytes));

    if (resource.DataBlock is not Texture texture)
    {
        Console.WriteLine($"{map,-14} not a texture block");
        continue;
    }

    using var bitmap = texture.GenerateBitmap();

    // 1920x1080 of PNG is three megabytes of screenshot for a card that is
    // rendered a few hundred pixels wide. 1280x720 WebP is the same picture at
    // a twentieth of the weight, and still sharp as the veto board's banner.
    const int width = 1280;
    const int height = 720;
    using var scaled = bitmap.Resize(new SKImageInfo(width, height), new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
    using var image = SKImage.FromBitmap(scaled ?? bitmap);
    using var data = image.Encode(SKEncodedImageFormat.Webp, 82);

    var file = Path.Combine(outDir, $"{map}.webp");
    using var stream = File.Create(file);
    data.SaveTo(stream);

    Console.WriteLine($"{map,-14} {bitmap.Width}x{bitmap.Height} -> {width}x{height}  {data.Size / 1024} KiB  ({texture.Format})");
}
