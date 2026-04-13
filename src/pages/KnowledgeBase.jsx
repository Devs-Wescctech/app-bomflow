import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  BookOpen, 
  TrendingUp, 
  Clock, 
  ChevronRight, 
  Rocket, 
  Ticket, 
  CreditCard, 
  Users, 
  AlertCircle 
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function KnowledgeBase() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: categories = [] } = useQuery({
    queryKey: ['kbCategories'],
    queryFn: async () => {
      const cats = await base44.entities.KBCategory.filter({ active: true });
      return cats.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    },
    initialData: [],
  });

  const { data: allArticles = [] } = useQuery({
    queryKey: ['kbArticles'],
    queryFn: () => base44.entities.KBArticle.filter({ status: 'published' }, '-published_at'),
    initialData: [],
  });

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`${createPageUrl("KBSearch")}?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  // Artigos populares (últimos 30 dias, ordenados por visualizações)
  const popularArticles = allArticles
    .filter(a => {
      const publishedDate = new Date(a.published_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return publishedDate >= thirtyDaysAgo;
    })
    .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
    .slice(0, 6);

  // Artigos recentes
  const recentArticles = allArticles.slice(0, 6);

  const getIconComponent = (iconName) => {
    const iconMap = {
      'Rocket': Rocket,
      'Ticket': Ticket,
      'CreditCard': CreditCard,
      'Users': Users,
      'AlertCircle': AlertCircle,
      'BookOpen': BookOpen
    };
    return iconMap[iconName] || BookOpen;
  };

  const getCategoryArticleCount = (categoryId) => {
    return allArticles.filter(a => a.category_id === categoryId).length;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Base de Conhecimento
            </h1>
            <p className="text-xl text-blue-100">
              Encontre respostas para suas dúvidas rapidamente
            </p>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="max-w-3xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="search"
                placeholder="Digite sua dúvida…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 pr-4 py-6 text-lg bg-white border-0 shadow-lg"
              />
              <Button
                type="submit"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-blue-600 hover:bg-blue-700"
              >
                Buscar
              </Button>
            </div>
          </form>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Categorias */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Explorar por Categoria
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map(category => {
              const IconComponent = getIconComponent(category.icon);
              const articleCount = getCategoryArticleCount(category.id);
              
              return (
                <Link
                  key={category.id}
                  to={`${createPageUrl("KBCategory")}?slug=${category.slug}`}
                >
                  <Card className="hover:shadow-lg transition-all duration-200 cursor-pointer h-full border-2 hover:border-blue-500">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-blue-100 rounded-lg">
                          <IconComponent className="w-6 h-6 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg text-gray-900 mb-1">
                            {category.name}
                          </h3>
                          <p className="text-sm text-gray-600 mb-2">
                            {category.description}
                          </p>
                          <Badge variant="outline" className="text-xs">
                            {articleCount} {articleCount === 1 ? 'artigo' : 'artigos'}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Artigos Populares */}
        {popularArticles.length > 0 && (
          <section className="mb-16">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="w-6 h-6 text-orange-600" />
              <h2 className="text-2xl font-bold text-gray-900">
                Artigos Populares
              </h2>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {popularArticles.map(article => (
                <Link
                  key={article.id}
                  to={`${createPageUrl("KBArticle")}?slug=${article.slug}`}
                >
                  <Card className="hover:shadow-md transition-all duration-200 cursor-pointer h-full">
                    <CardContent className="p-6">
                      <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                        {article.title}
                      </h3>
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                        {article.summary}
                      </p>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{article.view_count || 0} visualizações</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Artigos Recentes */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <Clock className="w-6 h-6 text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-900">
              Mais Recentes
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentArticles.map(article => (
              <Link
                key={article.id}
                to={`${createPageUrl("KBArticle")}?slug=${article.slug}`}
              >
                <Card className="hover:shadow-md transition-all duration-200 cursor-pointer h-full">
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                      {article.title}
                    </h3>
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                      {article.summary}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {article.tags?.slice(0, 3).map((tag, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-xs text-gray-500">
                      {article.published_at && format(new Date(article.published_at), "dd 'de' MMM, yyyy", { locale: ptBR })}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="bg-gray-100 border-t mt-16">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-600">
            <a href="#" className="hover:text-blue-600">Política de Privacidade</a>
            <a href="#" className="hover:text-blue-600">LGPD</a>
            <a href="#" className="hover:text-blue-600">Contato</a>
            <Link to={createPageUrl("CreateTicket")} className="hover:text-blue-600 font-semibold">
              Abrir Ticket
            </Link>
          </div>
          <div className="text-center text-xs text-gray-500 mt-4">
            © 2025 Wescctech CRM - Todos os direitos reservados
          </div>
        </div>
      </footer>
    </div>
  );
}