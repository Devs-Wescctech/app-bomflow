import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThumbsUp, ThumbsDown, Home, ChevronRight, ExternalLink, Download, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import ReactMarkdown from "react-markdown";

export default function KBArticle() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const slug = urlParams.get('slug');

  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const [feedbackType, setFeedbackType] = useState(null);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [comment, setComment] = useState("");
  const [anonymousId] = useState(() => {
    let id = localStorage.getItem('kb_anonymous_id');
    if (!id) {
      id = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('kb_anonymous_id', id);
    }
    return id;
  });

  const { data: article, isLoading } = useQuery({
    queryKey: ['kbArticle', slug],
    queryFn: async () => {
      const articles = await base44.entities.KBArticle.filter({ slug, status: 'published' });
      if (articles.length > 0) {
        // Incrementar view_count
        const art = articles[0];
        await base44.entities.KBArticle.update(art.id, {
          view_count: (art.view_count || 0) + 1
        });
        return art;
      }
      return null;
    },
    enabled: !!slug,
  });

  const { data: category } = useQuery({
    queryKey: ['kbCategory', article?.category_id],
    queryFn: async () => {
      if (!article?.category_id) return null;
      const cats = await base44.entities.KBCategory.list();
      return cats.find(c => c.id === article.category_id);
    },
    enabled: !!article?.category_id,
  });

  const { data: relatedArticles = [] } = useQuery({
    queryKey: ['relatedArticles', article?.id],
    queryFn: async () => {
      if (!article) return [];
      
      // Buscar artigos relacionados manualmente definidos
      if (article.related_articles?.length > 0) {
        const all = await base44.entities.KBArticle.filter({ status: 'published' });
        return all.filter(a => article.related_articles.includes(a.id)).slice(0, 3);
      }
      
      // Buscar por tags similares
      if (article.tags?.length > 0) {
        const all = await base44.entities.KBArticle.filter({ status: 'published' });
        return all
          .filter(a => a.id !== article.id && a.tags?.some(t => article.tags.includes(t)))
          .slice(0, 3);
      }
      
      return [];
    },
    enabled: !!article,
    initialData: [],
  });

  const feedbackMutation = useMutation({
    mutationFn: async ({ helpful, comment }) => {
      await base44.entities.KBFeedback.create({
        article_id: article.id,
        helpful,
        comment: comment || null,
        anonymous_id: anonymousId,
        user_agent: navigator.userAgent,
        referer: document.referrer,
      });

      // Atualizar contadores no artigo
      const field = helpful ? 'helpful_count' : 'not_helpful_count';
      await base44.entities.KBArticle.update(article.id, {
        [field]: (article[field] || 0) + 1
      });
    },
    onSuccess: () => {
      setFeedbackGiven(true);
      queryClient.invalidateQueries({ queryKey: ['kbArticle', slug] });
    },
  });

  const handleFeedback = (helpful) => {
    setFeedbackType(helpful);
    if (!helpful) {
      setShowCommentBox(true);
    } else {
      feedbackMutation.mutate({ helpful: true });
    }
  };

  const handleSubmitFeedback = () => {
    feedbackMutation.mutate({
      helpful: false,
      comment: comment.trim()
    });
    setShowCommentBox(false);
  };

  if (isLoading || !article) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const helpfulRate = article.helpful_count + article.not_helpful_count > 0
    ? Math.round((article.helpful_count / (article.helpful_count + article.not_helpful_count)) * 100)
    : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Breadcrumbs */}
      <div className="bg-white dark:bg-gray-800 border-b">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Link to={createPageUrl("KnowledgeBase")} className="hover:text-blue-600 flex items-center gap-1">
              <Home className="w-4 h-4" />
              Base de Conhecimento
            </Link>
            {category && (
              <>
                <ChevronRight className="w-4 h-4" />
                <Link
                  to={`${createPageUrl("KBCategory")}?slug=${category.slug}`}
                  className="hover:text-blue-600"
                >
                  {category.name}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            {article.title}
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-4">
            {article.summary}
          </p>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <span>
              Atualizado em {format(new Date(article.updated_at || article.published_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </span>
            <span>•</span>
            <span>{article.view_count || 0} visualizações</span>
            {helpfulRate !== null && (
              <>
                <span>•</span>
                <span>{helpfulRate}% acharam útil</span>
              </>
            )}
          </div>
          {article.tags && article.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {article.tags.map((tag, idx) => (
                <Badge key={idx} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </header>

        {/* Content */}
        <Card className="mb-8">
          <CardContent className="p-8 prose prose-lg dark:prose-invert max-w-none">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="text-3xl font-bold mt-8 mb-4">{children}</h1>,
                h2: ({ children }) => <h2 className="text-2xl font-bold mt-6 mb-3">{children}</h2>,
                h3: ({ children }) => <h3 className="text-xl font-bold mt-4 mb-2">{children}</h3>,
                p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-2">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                a: ({ children, href }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                    {children}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ),
                code: ({ inline, children }) => {
                  return inline ? (
                    <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm">
                      {children}
                    </code>
                  ) : (
                    <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto">
                      <code>{children}</code>
                    </pre>
                  );
                },
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-blue-500 pl-4 py-2 bg-blue-50 dark:bg-blue-900/20 my-4">
                    {children}
                  </blockquote>
                ),
              }}
            >
              {article.body}
            </ReactMarkdown>
          </CardContent>
        </Card>

        {/* Attachments */}
        {article.attachments && article.attachments.length > 0 && (
          <Card className="mb-8">
            <CardContent className="p-6">
              <h3 className="font-semibold text-lg mb-4">Anexos</h3>
              <div className="space-y-2">
                {article.attachments.map((att, idx) => (
                  <a
                    key={idx}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 border rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Download className="w-5 h-5 text-blue-600" />
                    <div className="flex-1">
                      <p className="font-medium">{att.name}</p>
                      <p className="text-xs text-gray-500">{att.size}</p>
                    </div>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Feedback Widget */}
        <Card className="mb-8">
          <CardContent className="p-6">
            {!feedbackGiven ? (
              <div>
                <h3 className="font-semibold text-lg mb-2">Este artigo ajudou?</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Seu feedback nos ajuda a melhorar continuamente.
                </p>
                <div className="flex gap-3 mb-4">
                  <Button
                    onClick={() => handleFeedback(true)}
                    variant="outline"
                    className="flex items-center gap-2"
                    disabled={feedbackMutation.isPending}
                  >
                    <ThumbsUp className="w-4 h-4" />
                    Sim
                  </Button>
                  <Button
                    onClick={() => handleFeedback(false)}
                    variant="outline"
                    className="flex items-center gap-2"
                    disabled={feedbackMutation.isPending}
                  >
                    <ThumbsDown className="w-4 h-4" />
                    Não
                  </Button>
                </div>

                {showCommentBox && (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Se não ajudou, conte rapidamente o que faltou (opcional):
                    </p>
                    <Textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      maxLength={300}
                      rows={3}
                      placeholder="Sua sugestão..."
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">{comment.length}/300</span>
                      <Button
                        onClick={handleSubmitFeedback}
                        disabled={feedbackMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        Enviar Feedback
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Obrigado! Seu feedback nos ajuda a melhorar.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Related Articles */}
        {relatedArticles.length > 0 && (
          <Card className="mb-8">
            <CardContent className="p-6">
              <h3 className="font-semibold text-lg mb-4">Artigos relacionados</h3>
              <div className="space-y-3">
                {relatedArticles.map(related => (
                  <Link
                    key={related.id}
                    to={`${createPageUrl("KBArticle")}?slug=${related.slug}`}
                    className="block p-4 border rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <h4 className="font-medium text-gray-900 dark:text-white mb-1">
                      {related.title}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {related.summary}
                    </p>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* CTA */}
        <Alert>
          <AlertDescription className="flex items-center justify-between">
            <span>Não resolveu? Abra um ticket e nossa equipe ajuda você.</span>
            <Link to={createPageUrl("CreateTicket")}>
              <Button className="bg-blue-600 hover:bg-blue-700">
                Abrir Ticket
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}