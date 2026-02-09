import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Paperclip, Upload, X, File, FileText, Image as ImageIcon, Download } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function AttachmentsUpload({ attachments = [], onAttachmentsChange, allowUpload = true }) {
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    const uploadedFiles = [];

    for (const file of files) {
      try {
        const result = await base44.integrations.Core.UploadFile({ file });
        uploadedFiles.push({
          name: file.name,
          url: result.file_url,
          size: file.size,
          type: file.type,
          uploaded_at: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Upload error:', error);
      }
    }

    onAttachmentsChange([...attachments, ...uploadedFiles]);
    setUploading(false);
    e.target.value = '';
  };

  const handleRemove = (index) => {
    const newAttachments = attachments.filter((_, i) => i !== index);
    onAttachmentsChange(newAttachments);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (type) => {
    if (type?.startsWith('image/')) return ImageIcon;
    if (type?.includes('pdf')) return FileText;
    return File;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Paperclip className="w-4 h-4" />
            Anexos {attachments.length > 0 && `(${attachments.length})`}
          </CardTitle>
          {allowUpload && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById('file-upload').click()}
              disabled={uploading}
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? 'Enviando...' : 'Adicionar'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <input
          id="file-upload"
          type="file"
          multiple
          className="hidden"
          onChange={handleFileUpload}
          disabled={!allowUpload}
        />

        {attachments.length > 0 ? (
          <div className="space-y-2">
            {attachments.map((attachment, index) => {
              const Icon = getFileIcon(attachment.type);
              return (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="p-2 bg-blue-50 rounded">
                    <Icon className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {attachment.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {formatFileSize(attachment.size)}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => window.open(attachment.url, '_blank')}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    {allowUpload && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleRemove(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 text-sm">
            {allowUpload ? 'Nenhum anexo adicionado' : 'Sem anexos'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}