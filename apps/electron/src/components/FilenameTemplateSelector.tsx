import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import {
  GripVertical,
  Plus,
  X,
  FileText,
  Calendar,
  Clock,
  Hash,
  User,
  Play,
  Download,
  Edit3,
} from "lucide-react";

interface FilenameTemplate {
  id: string;
  type: "variable" | "text";
  value: string;
  label: string;
  icon: React.ReactNode;
}

const AVAILABLE_TEMPLATES: Omit<FilenameTemplate, "id">[] = [
  {
    type: "variable",
    value: "%(title)s",
    label: "Video Title",
    icon: <FileText className="h-3 w-3" />,
  },
  {
    type: "variable",
    value: "%(upload_date)s",
    label: "Upload Date",
    icon: <Calendar className="h-3 w-3" />,
  },
  {
    type: "variable",
    value: "%(duration)s",
    label: "Duration",
    icon: <Clock className="h-3 w-3" />,
  },
  {
    type: "variable",
    value: "%(view_count)s",
    label: "View Count",
    icon: <Hash className="h-3 w-3" />,
  },
  {
    type: "variable",
    value: "%(uploader)s",
    label: "Channel Name",
    icon: <User className="h-3 w-3" />,
  },
  {
    type: "variable",
    value: "%(id)s",
    label: "Video ID",
    icon: <Play className="h-3 w-3" />,
  },
  {
    type: "variable",
    value: "%(ext)s",
    label: "File Extension",
    icon: <Download className="h-3 w-3" />,
  },
];

interface FilenameTemplateSelectorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function FilenameTemplateSelector({
  value,
  onChange,
  placeholder = "Enter filename template...",
}: FilenameTemplateSelectorProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [templates, setTemplates] = useState<FilenameTemplate[]>(() => {
    // Parse existing value into templates
    if (!value) {
      // Set default template if no value provided
      const defaultTemplate: FilenameTemplate = {
        id: "default-title",
        type: "variable",
        value: "%(title)s",
        label: "Video Title",
        icon: <FileText className="h-3 w-3" />,
      };

      const extTemplate: FilenameTemplate = {
        id: "default-ext",
        type: "variable",
        value: "%(ext)s",
        label: "File Extension",
        icon: <Download className="h-3 w-3" />,
      };

      const dotTemplate: FilenameTemplate = {
        id: "default-dot",
        type: "text",
        value: ".",
        label: ".",
        icon: null,
      };

      return [defaultTemplate, dotTemplate, extTemplate];
    }

    const parsed: FilenameTemplate[] = [];
    const currentText = "";
    let idCounter = 0;

    // Simple parser for existing templates
    const regex = /%\([^)]+\)s/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(value)) !== null) {
      // Add text before the variable
      if (match.index > lastIndex) {
        const text = value.slice(lastIndex, match.index);
        if (text) {
          parsed.push({
            id: `text-${idCounter++}`,
            type: "text",
            value: text,
            label: text,
            icon: null,
          });
        }
      }

      // Add the variable
      const variable = match[0];
      const template = AVAILABLE_TEMPLATES.find((t) => t.value === variable);
      if (template) {
        parsed.push({
          id: `var-${idCounter++}`,
          ...template,
        });
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < value.length) {
      const text = value.slice(lastIndex);
      if (text) {
        parsed.push({
          id: `text-${idCounter++}`,
          type: "text",
          value: text,
          label: text,
          icon: null,
        });
      }
    }

    return parsed;
  });

  const [customText, setCustomText] = useState("");

  const generateFilename = (templates: FilenameTemplate[]) => {
    return templates.map((t) => t.value).join("");
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const newTemplates = Array.from(templates);
    const [reorderedItem] = newTemplates.splice(result.source.index, 1);
    newTemplates.splice(result.destination.index, 0, reorderedItem);

    setTemplates(newTemplates);
    onChange(generateFilename(newTemplates));
  };

  const addTemplate = (template: Omit<FilenameTemplate, "id">) => {
    const newTemplate: FilenameTemplate = {
      ...template,
      id: `template-${Date.now()}`,
    };

    const newTemplates = [...templates, newTemplate];
    setTemplates(newTemplates);
    onChange(generateFilename(newTemplates));
  };

  const removeTemplate = (id: string) => {
    const newTemplates = templates.filter((t) => t.id !== id);
    setTemplates(newTemplates);
    onChange(generateFilename(newTemplates));
  };

  const addCustomText = () => {
    if (!customText.trim()) return;

    const newTemplate: FilenameTemplate = {
      id: `text-${Date.now()}`,
      type: "text",
      value: customText,
      label: customText,
      icon: null,
    };

    const newTemplates = [...templates, newTemplate];
    setTemplates(newTemplates);
    setCustomText("");
    onChange(generateFilename(newTemplates));
  };

  const clearAll = () => {
    setTemplates([]);
    onChange("");
  };

  const setDefaultTemplate = () => {
    const defaultTemplate: FilenameTemplate = {
      id: "default-title",
      type: "variable",
      value: "%(title)s",
      label: "Video Title",
      icon: <FileText className="h-3 w-3" />,
    };

    const extTemplate: FilenameTemplate = {
      id: "default-ext",
      type: "variable",
      value: "%(ext)s",
      label: "File Extension",
      icon: <Download className="h-3 w-3" />,
    };

    const dotTemplate: FilenameTemplate = {
      id: "default-dot",
      type: "text",
      value: ".",
      label: ".",
      icon: null,
    };

    const defaultTemplates = [defaultTemplate, dotTemplate, extTemplate];
    setTemplates(defaultTemplates);
    onChange(generateFilename(defaultTemplates));
  };

  const previewFilename = generateFilename(templates);

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <div className="space-y-2">
          <Label>Output Filename (Optional)</Label>
          <div className="relative">
            <Input
              value={value}
              placeholder={placeholder}
              readOnly
              className="cursor-pointer pr-10"
              onFocus={() => setIsDialogOpen(true)}
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1 h-8 w-8 p-0"
              onClick={() => setIsDialogOpen(true)}
            >
              <Edit3 className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Click to customize filename template</p>
        </div>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filename Template Editor</DialogTitle>
          <DialogDescription>
            Customize your download filename template using variables and custom text
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Template Display */}
          <div className="space-y-2">
            <Label>Current Template</Label>
            <div className="min-h-[60px] rounded-md border bg-muted/50 p-3">
              {templates.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">
                  No template selected. Add variables below to build your filename.
                </p>
              ) : (
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="filename-templates" direction="horizontal">
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="flex flex-wrap gap-2"
                      >
                        {templates.map((template, index) => (
                          <Draggable key={template.id} draggableId={template.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`flex items-center gap-1 rounded-md border bg-background px-2 py-1 ${
                                  snapshot.isDragging ? "shadow-lg" : ""
                                }`}
                              >
                                <div
                                  {...provided.dragHandleProps}
                                  className="cursor-grab active:cursor-grabbing"
                                >
                                  <GripVertical className="h-3 w-3 text-muted-foreground" />
                                </div>

                                {template.icon && (
                                  <span className="text-muted-foreground">{template.icon}</span>
                                )}

                                <span className="text-sm font-medium">
                                  {template.type === "variable" ? template.label : template.value}
                                </span>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                                  onClick={() => removeTemplate(template.id)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              )}
            </div>

            {/* Preview */}
            {previewFilename && (
              <div className="text-xs text-muted-foreground">
                <strong>Preview:</strong> {previewFilename}
              </div>
            )}
          </div>

          {/* Available Templates */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Available Variables</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_TEMPLATES.map((template) => (
                  <Button
                    key={template.value}
                    variant="outline"
                    size="sm"
                    className="h-auto justify-start p-2"
                    onClick={() => addTemplate(template)}
                  >
                    <span className="mr-2 text-muted-foreground">{template.icon}</span>
                    <div className="text-left">
                      <div className="text-xs font-medium">{template.label}</div>
                      <div className="text-xs text-muted-foreground">{template.value}</div>
                    </div>
                  </Button>
                ))}
              </div>

              {/* Custom Text Input */}
              <div className="flex gap-2 border-t pt-2">
                <Input
                  placeholder="Add custom text..."
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && addCustomText()}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addCustomText}
                  disabled={!customText.trim()}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add
                </Button>
              </div>

              {/* Actions */}
              <div className="flex gap-2 border-t pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAll}
                  disabled={templates.length === 0}
                >
                  Clear All
                </Button>
                <Button variant="outline" size="sm" onClick={setDefaultTemplate}>
                  Set Default
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Manual Input (Advanced) */}
          <div className="space-y-2">
            <Label htmlFor="manual-input" className="text-xs text-muted-foreground">
              Advanced: Manual Input
            </Label>
            <Input
              id="manual-input"
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="text-xs"
            />
          </div>

          {/* Dialog Actions */}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setIsDialogOpen(false)}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
