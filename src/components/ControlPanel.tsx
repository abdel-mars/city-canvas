import { ArtworkSettings, City, ColorPreset, FontFamily } from '@/types/artwork';
import ColorPresets from './ColorPresets';
import TypographyControls from './TypographyControls';
import DownloadShare from './DownloadShare';

interface ControlPanelProps {
  settings: ArtworkSettings;
  onSettingsChange: (settings: ArtworkSettings) => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
  /** The full city, not just its name: a gift link has to carry the bounding box to re-render. */
  city: City;
  /**
   * The window the roads actually cover, when it is smaller than the city's own extent.
   *
   * A gift link must re-render the poster the creator is looking at, so it has to record the
   * window that was drawn rather than the window that was asked for. Sending the larger box would
   * resolve to a different network once Overpass is asked again, and the recipient would receive a
   * poster of a different area wearing the same name.
   */
  bbox?: [number, number, number, number];
  hasRoads: boolean;
  onTransparentChange: (value: boolean) => void;
}

const ControlPanel = ({
  settings,
  onSettingsChange,
  svgRef,
  city,
  bbox,
  hasRoads,
  onTransparentChange,
}: ControlPanelProps) => {
  const update = (partial: Partial<ArtworkSettings>) => {
    onSettingsChange({ ...settings, ...partial });
  };

  const handlePresetSelect = (preset: ColorPreset) => {
    update({
      preset,
      background: preset.background,
      road: preset.road,
      text: preset.text,
    });
  };

  return (
    <div className="space-y-6 p-6">
      <ColorPresets
        selected={settings.preset}
        onSelect={handlePresetSelect}
        background={settings.background}
        road={settings.road}
        text={settings.text}
        onBackgroundChange={(background: string) => update({ background })}
        onRoadChange={(road: string) => update({ road })}
        onTextChange={(text: string) => update({ text })}
      />

      <div className="border-t border-border" />

      <TypographyControls
        font={settings.font}
        textPositionY={settings.textPositionY}
        textSize={settings.textSize}
        customName={settings.customName}
        showCustomName={settings.showCustomName}
        onFontChange={(font: FontFamily) => update({ font })}
        onPositionChange={(textPositionY: number) => update({ textPositionY })}
        onSizeChange={(textSize: number) => update({ textSize })}
        onCustomNameChange={(customName: string) => update({ customName })}
        onShowCustomNameChange={(showCustomName: boolean) => update({ showCustomName })}
      />

      {hasRoads && (
        <>
          <div className="border-t border-border" />

          <DownloadShare
            svgRef={svgRef}
            city={city}
            bbox={bbox}
            settings={settings}
            textColor={settings.text}
            onTransparentChange={onTransparentChange}
          />
        </>
      )}
    </div>
  );
};

export default ControlPanel;
