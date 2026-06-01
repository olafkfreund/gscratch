{
  description = "GNOME Shell extension that shows/hides apps as floating scratchpads via keyboard shortcuts";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      uuid = "scratchpad@wastedintelligence.com";
      version = self.shortRev or "0-unstable";

      supportedSystems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
      pkgsFor = system: import nixpkgs { inherit system; };

      # The extension is pure JS plus a GSettings schema, so there is nothing to
      # compile except the schema. Flakes only copy git-tracked files, so dev-only
      # paths (bin/, test/, .agent-os/) and the gitignored gschemas.compiled are
      # excluded automatically; the install step copies just the runtime files.
      mkExtension = pkgs: pkgs.stdenvNoCC.mkDerivation {
        pname = "gnome-shell-extension-scratchpad";
        inherit version;
        src = ./.;

        nativeBuildInputs = [ pkgs.glib ]; # provides glib-compile-schemas
        dontConfigure = true;

        buildPhase = ''
          runHook preBuild
          glib-compile-schemas schemas
          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall
          dir="$out/share/gnome-shell/extensions/${uuid}"
          install -d "$dir"
          cp -r \
            metadata.json \
            extension.js prefs.js config.js keybinder.js window.js dbusService.js \
            schemas \
            "$dir/"
          runHook postInstall
        '';

        # Lets home-manager's programs.gnome-shell.extensions discover the UUID.
        passthru.extensionUuid = uuid;

        meta = {
          description = "Show and hide floating apps using keyboard shortcuts (i3/Sway-style scratchpads for GNOME)";
          homepage = "https://github.com/olafkfreund/gscratch";
          platforms = pkgs.lib.platforms.linux;
          # Upstream ships no LICENSE file, so license is intentionally unspecified.
        };
      };
    in
    {
      overlays.default = _final: prev: {
        gnome-shell-extension-scratchpad = mkExtension prev;
      };

      packages = forAllSystems (system:
        let pkgs = pkgsFor system; in
        {
          default = mkExtension pkgs;
          scratchpad = mkExtension pkgs;
        });

      devShells = forAllSystems (system:
        let pkgs = pkgsFor system; in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [ gjs glib nixpkgs-fmt ];
          };
        });

      formatter = forAllSystems (system: (pkgsFor system).nixpkgs-fmt);
    };
}
