import React, { useState, useRef, useEffect } from 'react';
import { Box, Typography, Stack, Divider, IconButton, Select, MenuItem, Button, Paper } from '@mui/material';
import * as AspectRatioOutlinedModule from '@mui/icons-material/AspectRatioOutlined';
import * as DragIndicatorModule from '@mui/icons-material/DragIndicator';
import * as DeleteOutlineModule from '@mui/icons-material/DeleteOutline';
import * as AddModule from '@mui/icons-material/Add';
import { useTranslation } from '../../../../i18n/useTranslation';
import SocialsPropsSchema, { SocialsProps, SOCIAL_PLATFORMS, ICON_STYLES, SocialPlatform, IconStyle } from '../../../../documents/blocks/Socials/SocialsPropsSchema';
import BaseSidebarPanel from './helpers/BaseSidebarPanel';
import ToggleButton from '@mui/material/ToggleButton';
import TextInput from './helpers/inputs/TextInput';
import SliderInput from './helpers/inputs/SliderInput';
import MultiStylePropertyPanel from './helpers/style-inputs/MultiStylePropertyPanel';
import { ZodError } from 'zod';

import { resolveMuiIcon } from '../../../../utils/resolveMuiIcon';

const AspectRatioOutlined = resolveMuiIcon(AspectRatioOutlinedModule);
const DragIndicator = resolveMuiIcon(DragIndicatorModule);
const DeleteOutline = resolveMuiIcon(DeleteOutlineModule);
const Add = resolveMuiIcon(AddModule);

// Platform display names
const PLATFORM_NAMES: Record<SocialPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  snapchat: 'Snapchat',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  discord: 'Discord',
  reddit: 'Reddit',
  twitch: 'Twitch',
  threads: 'Threads',
};

// Icon style display names
const ICON_STYLE_NAMES: Record<IconStyle, string> = {
  'no-border-black': 'Glyph Dark',
  'no-border-white': 'Glyph Light',
  'origin-colorful': 'Circular Dynamic Color',
  'with-border-black': 'Circular Dark',
  'with-border-white': 'Circular Light',
  'with-border-line-colorful': 'Circular Outline Color',
  'with-border-line-black': 'Circular Outline Dark',
  'with-border-line-white': 'Circular Outline Light',
  'standard': 'Standard',
};

type SocialsSidebarPanelProps = {
  data: SocialsProps;
  setData: (v: SocialsProps) => void;
};

export default function SocialsSidebarPanel({ data, setData }: SocialsSidebarPanelProps) {
  const { t } = useTranslation();
  const [, setErrors] = useState<ZodError | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [insertPosition, setInsertPosition] = useState<'top' | 'bottom' | null>(null); // Insert position: above or below
  const isHandlerClickedRef = useRef<boolean>(false); // Tracks whether the drag handle was pressed

  const updateData = (d: unknown) => {
    const res = SocialsPropsSchema.safeParse(d);
    if (res.success) {
      setData(res.data);
      setErrors(null);
    } else {
      setErrors(res.error);
    }
  };

  const iconStyle = data.props?.iconStyle || 'origin-colorful';
  const iconSize = data.props?.iconSize ?? 36;
  const socials = data.props?.socials || [];

  // Use socials directly; may be empty
  const currentSocials = socials;

  // Extract the platforms array from socials
  const platforms = currentSocials.map(s => s.platform);

  // Handle icon style selection
  const handleIconStyleChange = (style: string) => {
    updateData({
      ...data,
      props: {
        ...data.props,
        iconStyle: style as IconStyle,
      },
    });
  };

  // Update the link at the given index
  const updateSocialUrl = (index: number, url: string | null) => {
    const newSocials = [...currentSocials];
    newSocials[index] = { ...newSocials[index], url };
    updateData({
      ...data,
      props: {
        ...data.props,
        platforms: newSocials.map(s => s.platform),
        socials: newSocials,
      },
    });
  };

  // Update the platform at the given index
  const updateSocialPlatform = (index: number, platform: SocialPlatform) => {
    const newSocials = [...currentSocials];
    newSocials[index] = { ...newSocials[index], platform };
    updateData({
      ...data,
      props: {
        ...data.props,
        platforms: newSocials.map(s => s.platform),
        socials: newSocials,
      },
    });
  };

  // Remove the social at the given index (removing all is allowed)
  const deleteSocial = (index: number) => {
    const newSocials = currentSocials.filter((_, i) => i !== index);
    updateData({
      ...data,
      props: {
        ...data.props,
        platforms: newSocials.map(s => s.platform),
        socials: newSocials,
      },
    });
  };

  // Add a new social (duplicates allowed)
  const addSocial = () => {
    // Prefer the first platform not yet used
    const usedPlatforms = new Set(currentSocials.map(s => s.platform));
    const availablePlatform = SOCIAL_PLATFORMS.find(p => !usedPlatforms.has(p));

    // If all are used, fall back to the first (facebook)
    const platformToAdd = availablePlatform || SOCIAL_PLATFORMS[0];

    const newSocials = [...currentSocials, { platform: platformToAdd as SocialPlatform, url: null }];
    updateData({
      ...data,
      props: {
        ...data.props,
        platforms: newSocials.map(s => s.platform),
        socials: newSocials,
      },
    });
  };

  // Drag to reorder (insert)
  const handleDragStart = (index: number, e: React.DragEvent) => {
    // Only allow drags started from the handle
    if (!isHandlerClickedRef.current) {
      e.preventDefault();
      return;
    }

    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `social-${index}`);
  };

  // Handle mousedown
  const handleHandlerMouseDown = () => {
    isHandlerClickedRef.current = true;
  };

  // Reset the flag on mouseup
  useEffect(() => {
    const handleMouseUp = () => {
      isHandlerClickedRef.current = false;
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedIndex === null) return;

    // No insert line when dragging over itself
    if (draggedIndex === index) {
      setDragOverIndex(null);
      setInsertPosition(null);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseY = e.clientY;
    const elementCenterY = rect.top + rect.height / 2;

    // Use the mouse position to choose above or below
    const position = mouseY < elementCenterY ? 'top' : 'bottom';

    setDragOverIndex(index);
    setInsertPosition(position);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // handleDragLeave intentionally does not clear state
    // keep the insert line visible until drop or dragEnd
    // so moving through gaps does not reset the drag
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedIndex === null) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      setInsertPosition(null);
      return;
    }

    // Dropping onto itself is a no-op
    if (draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      setInsertPosition(null);
      return;
    }

    const newSocials = [...currentSocials];
    const [removed] = newSocials.splice(draggedIndex, 1);

    // Compute the target index from the insert position
    let targetIndex: number;
    if (insertPosition === 'top') {
      // Insert above the target
      targetIndex = dropIndex;
      // If the source was before the target, subtract 1 since it was already removed
      if (draggedIndex < dropIndex) {
        targetIndex = dropIndex - 1;
      }
    } else {
      // Insert below the target
      targetIndex = dropIndex + 1;
      // If the source was before the target, subtract 1 since it was already removed
      if (draggedIndex < dropIndex) {
        targetIndex = dropIndex;
      }
    }

    // Clamp the index
    targetIndex = Math.max(0, Math.min(targetIndex, newSocials.length));

    newSocials.splice(targetIndex, 0, removed);

    updateData({
      ...data,
      props: {
        ...data.props,
        platforms: newSocials.map(s => s.platform),
        socials: newSocials,
      },
    });

    setDraggedIndex(null);
    setDragOverIndex(null);
    setInsertPosition(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    setInsertPosition(null);
    isHandlerClickedRef.current = false; // Reset the flag
  };


  return (
    <BaseSidebarPanel title={t('socials.title')}>
      {/* Social list - drag to reorder */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1, fontSize: '12px', fontWeight: 500 }}>
          {t('socials.selectPlatforms')}
        </Typography>
        <Stack
          spacing={1}
          onDragOver={(e) => {
            // Handle dragover on the Stack so the drag survives gaps between items
            if (draggedIndex !== null) {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'move';

              const mouseY = e.clientY;

              // Find all Paper elements
              const papers = Array.from((e.currentTarget as HTMLElement).querySelectorAll('.MuiPaper-root')) as HTMLElement[];

              // Find the index under the mouse
              for (let i = 0; i < papers.length; i++) {
                const paperRect = papers[i].getBoundingClientRect();

                // Check whether the mouse is within this Paper, including the gaps
                // Expand the hit area by 24px above and below
                const expandedTop = paperRect.top - 24; // Gap above
                const expandedBottom = paperRect.bottom + 24; // Gap below

                if (mouseY >= expandedTop && mouseY <= expandedBottom) {
                  const paperCenterY = paperRect.top + paperRect.height / 2;
                  const position = mouseY < paperCenterY ? 'top' : 'bottom';

                  if (i !== draggedIndex) {
                    setDragOverIndex(i);
                    setInsertPosition(position);
                  }
                  break;
                }
              }
            }
          }}
          onDrop={(e) => {
            // Handle drop on the Stack too so dropping in a gap works
            if (draggedIndex !== null && dragOverIndex !== null) {
              e.preventDefault();
              e.stopPropagation();
              handleDrop(e, dragOverIndex);
            }
          }}
        >
          {currentSocials.map((social, index) => {
            const platformName = PLATFORM_NAMES[social.platform as SocialPlatform];
            const isDragging = draggedIndex === index;
            const isDragOver = dragOverIndex === index;
            const showTopInsertLine = isDragOver && insertPosition === 'top';
            const showBottomInsertLine = isDragOver && insertPosition === 'bottom';
            // Use the index as key so duplicate platforms render and drag correctly
            const itemKey = `social-${index}`;

            return (
              <React.Fragment key={itemKey}>
                {/* Insert line above */}
                {showTopInsertLine && (
                  <Box
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'move';
                      // Over the line: insert above this item
                      if (draggedIndex !== null && draggedIndex !== index) {
                        setDragOverIndex(index);
                        setInsertPosition('top');
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDrop(e, index);
                    }}
                    sx={{
                      height: '24px', // Tall hit area to cover the gap
                      py: '11px', // Padding
                      display: 'flex',
                      alignItems: 'center',
                      // cursor: 'move',
                      position: 'relative',
                      zIndex: 1, // Keep the insert line on top
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: '50%',
                        left: '0',
                        right: '0',
                        transform: 'translateY(-50%)',
                        height: '2px',
                        backgroundColor: 'primary.main',
                        borderRadius: '1px',
                        mx: 1,
                      },
                    }}
                  />
                )}
                <Paper
                  draggable
                  onDragStart={(e) => handleDragStart(index, e)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    handleDragOver(e, index);
                  }}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(e, index);
                  }}
                  onDragEnd={handleDragEnd}
                  sx={{
                    p: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    backgroundColor: isDragging ? 'action.hover' : 'background.paper',
                    opacity: isDragging ? 0.5 : 1,
                    // cursor: 'move',
                    '&:hover': {
                      borderColor: 'primary.main',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <IconButton
                      size="small"
                      sx={{ cursor: 'grab', color: 'text.secondary', '&:active': { cursor: 'grabbing' } }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleHandlerMouseDown();
                      }}
                    >
                      <DragIndicator fontSize="small" />
                    </IconButton>
                    <Select
                      value={social.platform}
                      onChange={(e) => updateSocialPlatform(index, e.target.value as SocialPlatform)}
                      size="small"
                      sx={{ flex: 1, fontSize: '12px' }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {SOCIAL_PLATFORMS.map((platform) => {
                        const name = PLATFORM_NAMES[platform];
                        return (
                          <MenuItem key={platform} value={platform}>
                            {name}
                          </MenuItem>
                        );
                      })}
                    </Select>
                    <IconButton
                      size="small"
                      onClick={() => deleteSocial(index)}
                      sx={{ color: 'error.main' }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </Box>
                  <Box onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                    <TextInput
                      label=""
                      placeholder={`${t('socials.iconUrl')} - ${platformName}`}
                      defaultValue={social.url || ''}
                      onChange={(url) => updateSocialUrl(index, url || null)}
                    />
                  </Box>
                </Paper>
                {/* Insert line below */}
                {showBottomInsertLine && (
                  <Box
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'move';
                      // Over the line: insert below this item
                      if (draggedIndex !== null && draggedIndex !== index) {
                        setDragOverIndex(index);
                        setInsertPosition('bottom');
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDrop(e, index);
                    }}
                    sx={{
                      height: '24px', // Tall hit area to cover the gap
                      py: '11px', // Padding
                      display: 'flex',
                      alignItems: 'center',
                      cursor: 'move',
                      position: 'relative',
                      zIndex: 1, // Keep the insert line on top
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: '50%',
                        left: '0',
                        right: '0',
                        transform: 'translateY(-50%)',
                        height: '2px',
                        backgroundColor: 'primary.main',
                        borderRadius: '1px',
                        mx: 1,
                      },
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </Stack>
        <Button
          startIcon={<Add />}
          onClick={addSocial}
          variant="outlined"
          size="small"
          fullWidth
          sx={{ mt: 1 }}
        >
          {t('socials.addAnother')}
        </Button>
      </Box>

      <Divider sx={{ my: 1 }} />

      {/* Icon style */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1, fontSize: '12px', fontWeight: 500 }}>
          {t('socials.iconStyle')}
        </Typography>
        <Stack spacing={1} sx={{ mt: 1 }}>
          {ICON_STYLES.map((style) => {
            const styleName = ICON_STYLE_NAMES[style];
            const isSelected = iconStyle === style;
            return (
              <ToggleButton
                key={style}
                value={style}
                selected={isSelected}
                onChange={() => handleIconStyleChange(style)}
                fullWidth
                size="small"
                sx={{
                  fontSize: '12px',
                  justifyContent: 'flex-start',
                  textTransform: 'none',
                }}
              >
                {styleName}
              </ToggleButton>
            );
          })}
        </Stack>
      </Box>

      <Divider sx={{ my: 1 }} />

      {/* Icon size */}
      <Box sx={{ mb: 2 }}>
        <SliderInput
          label={t('socials.iconSize')}
          iconLabel={<AspectRatioOutlined sx={{ fontSize: 16 }} />}
          defaultValue={iconSize}
          onChange={(size) => {
            updateData({
              ...data,
              props: {
                ...data.props,
                iconSize: size,
              },
            });
          }}
          min={12}
          max={48}
          step={2}
          units="px"
          marks
        />
      </Box>

      {/* Background Color, Alignment and Padding */}
      <MultiStylePropertyPanel
        names={['backgroundColor', 'padding']}
        value={data.style}
        onChange={(style) => updateData({ ...data, style })}
      />
    </BaseSidebarPanel>
  );
}
