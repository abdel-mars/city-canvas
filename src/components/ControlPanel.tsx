import { ArtworkSettings, ColorPreset, FontFamily } from '@/types/artwork';
import ColorPresets from './ColorPresets';
import TypographyControls from './TypographyControls';
import DownloadShare from './DownloadShare';

interface ControlPanelProps {
  settings: ArtworkSettings;
  onSettingsChange: (settings: ArtworkSettings) => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
  cityName: string;
  hasRoads: boolean;
}

const ControlPanel = ({
  settings,
  onSettingsChange,
  svgRef,
  cityName,
  hasRoads,
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
        customName={settings.customName}
        showCustomName={settings.showCustomName}
        onFontChange={(font: FontFamily) => update({ font })}
        onPositionChange={(textPositionY: number) => update({ textPositionY })}
        onCustomNameChange={(customName: string) => update({ customName })}
        onShowCustomNameChange={(showCustomName: boolean) => update({ showCustomName })}
      />

      {hasRoads && (
        <>
          <div className="border-t border-border" />
          <DownloadShare
            svgRef={svgRef}
            cityName={cityName}
            textColor={settings.text}
          />
        </>
      )}
    </div>
  );
};

export default ControlPanel;
