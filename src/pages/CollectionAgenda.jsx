import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Phone, DollarSign, Clock, AlertCircle } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, parseISO, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const EVENT_TYPES = {
  follow_up: {
    label: "Follow-up",
    color: "bg-blue-500",
    bgLight: "bg-blue-50 dark:bg-blue-950",
    textColor: "text-blue-700 dark:text-blue-300",
    borderColor: "border-blue-200 dark:border-blue-800",
    icon: Phone
  },
  payment_promise: {
    label: "Promessa de Pagamento",
    color: "bg-yellow-500",
    bgLight: "bg-yellow-50 dark:bg-yellow-950",
    textColor: "text-yellow-700 dark:text-yellow-300",
    borderColor: "border-yellow-200 dark:border-yellow-800",
    icon: Clock
  },
  agreement: {
    label: "Acordo",
    color: "bg-green-500",
    bgLight: "bg-green-50 dark:bg-green-950",
    textColor: "text-green-700 dark:text-green-300",
    borderColor: "border-green-200 dark:border-green-800",
    icon: DollarSign
  },
  customer_return: {
    label: "Retorno do Cliente",
    color: "bg-purple-500",
    bgLight: "bg-purple-50 dark:bg-purple-950",
    textColor: "text-purple-700 dark:text-purple-300",
    borderColor: "border-purple-200 dark:border-purple-800",
    icon: AlertCircle
  }
};

export default function CollectionAgenda() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  const { data: tickets = [] } = useQuery({
    queryKey: ['collectionTickets'],
    queryFn: async () => {
      const allTickets = await base44.entities.Ticket.list('-createdDate', 500);
      return allTickets.filter(t => t.ticket_type === 'collection');
    },
    initialData: [],
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.list(),
    initialData: [],
  });

  // Extrair eventos agendados dos tickets
  const scheduledEvents = tickets.flatMap(ticket => {
    const description = JSON.parse(ticket.description || '{}');
    const events = [];

    // Verificar próximo follow-up
    if (description.next_follow_up) {
      events.push({
        id: `${ticket.id}-follow`,
        ticket_id: ticket.id,
        type: 'follow_up',
        date: description.next_follow_up,
        title: `Follow-up: ${ticket.subject.split(' - ')[1] || 'Cliente'}`,
        ticket,
        description: description.next_follow_up_notes || ''
      });
    }

    // Verificar promessa de pagamento
    if (description.payment_promise_date) {
      events.push({
        id: `${ticket.id}-promise`,
        ticket_id: ticket.id,
        type: 'payment_promise',
        date: description.payment_promise_date,
        title: `Promessa: ${ticket.subject.split(' - ')[1] || 'Cliente'}`,
        ticket,
        description: `Valor: R$ ${(description.payment_promise_amount || 0).toFixed(2)}`
      });
    }

    // Verificar data de pagamento do acordo
    if (description.agreement?.payment_date) {
      events.push({
        id: `${ticket.id}-agreement`,
        ticket_id: ticket.id,
        type: 'agreement',
        date: description.agreement.payment_date,
        title: `Acordo: ${ticket.subject.split(' - ')[1] || 'Cliente'}`,
        ticket,
        description: `R$ ${description.agreement.amount.toFixed(2)} - ${description.agreement.installments}x`
      });
    }

    // Verificar retorno do cliente
    if (description.customer_return_date) {
      events.push({
        id: `${ticket.id}-return`,
        ticket_id: ticket.id,
        type: 'customer_return',
        date: description.customer_return_date,
        title: `Retorno: ${ticket.subject.split(' - ')[1] || 'Cliente'}`,
        ticket,
        description: description.customer_return_notes || ''
      });
    }

    return events;
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { locale: ptBR });
  const calendarEnd = endOfWeek(monthEnd, { locale: ptBR });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getEventsForDay = (day) => {
    return scheduledEvents.filter(event => 
      isSameDay(parseISO(event.date), day)
    );
  };

  const previousMonth = () => {
    setCurrentDate(subMonths(currentDate, 1));
  };

  const nextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1));
  };

  const today = new Date();
  const isToday = (day) => isSameDay(day, today);
  const isCurrentMonth = (day) => day.getMonth() === currentDate.getMonth();

  const eventsForSelectedDate = selectedDate ? getEventsForDay(selectedDate) : [];

  const todayEvents = getEventsForDay(today);
  const upcomingEvents = scheduledEvents
    .filter(event => new Date(event.date) >= today)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Agenda de Cobrança</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Acompanhe follow-ups, promessas e acordos</p>
          </div>
          <div className="flex gap-2">
            {Object.entries(EVENT_TYPES).map(([key, type]) => {
              const Icon = type.icon;
              return (
                <div key={key} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${type.color}`}></div>
                  <span className="text-xs text-gray-600 dark:text-gray-400">{type.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Calendário */}
          <div className="lg:col-span-2">
            <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              <CardHeader className="border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-gray-900 dark:text-gray-100 text-xl">
                    {format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={previousMonth}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setCurrentDate(new Date())}
                    >
                      Hoje
                    </Button>
                    <Button variant="outline" size="icon" onClick={nextMonth}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                {/* Dias da semana */}
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                    <div key={day} className="text-center text-xs font-semibold text-gray-600 dark:text-gray-400 py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Grid de dias */}
                <div className="grid grid-cols-7 gap-2">
                  {calendarDays.map(day => {
                    const dayEvents = getEventsForDay(day);
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    
                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => setSelectedDate(day)}
                        className={`
                          min-h-[80px] p-2 rounded-lg border transition-all
                          ${isCurrentMonth(day) ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900 opacity-50'}
                          ${isToday(day) ? 'ring-2 ring-blue-500 dark:ring-blue-600' : 'border-gray-200 dark:border-gray-700'}
                          ${isSelected ? 'ring-2 ring-purple-500 dark:ring-purple-600' : ''}
                          hover:shadow-md
                        `}
                      >
                        <div className={`text-sm font-semibold mb-1 ${
                          isToday(day) ? 'text-blue-600 dark:text-blue-400' : 
                          isCurrentMonth(day) ? 'text-gray-900 dark:text-gray-100' : 
                          'text-gray-400 dark:text-gray-600'
                        }`}>
                          {format(day, 'd')}
                        </div>
                        <div className="space-y-1">
                          {dayEvents.slice(0, 2).map(event => {
                            const eventType = EVENT_TYPES[event.type];
                            return (
                              <div
                                key={event.id}
                                className={`${eventType.color} text-white text-xs px-1 py-0.5 rounded truncate`}
                                title={event.title}
                              >
                                {event.title.split(':')[1]?.trim() || event.title}
                              </div>
                            );
                          })}
                          {dayEvents.length > 2 && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              +{dayEvents.length - 2} mais
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Eventos de Hoje */}
            <Card className="border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900">
              <CardHeader className="bg-blue-50 dark:bg-blue-950 border-b border-blue-200 dark:border-blue-800">
                <CardTitle className="text-blue-900 dark:text-blue-100 flex items-center gap-2 text-base">
                  <CalendarIcon className="w-4 h-4" />
                  Hoje ({todayEvents.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {todayEvents.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    Nenhum evento hoje
                  </p>
                ) : (
                  <div className="space-y-2">
                    {todayEvents.map(event => {
                      const eventType = EVENT_TYPES[event.type];
                      const Icon = eventType.icon;
                      return (
                        <Link
                          key={event.id}
                          to={`${createPageUrl("CollectionTicketView")}?id=${event.ticket_id}`}
                          className={`block p-3 rounded-lg border ${eventType.borderColor} ${eventType.bgLight} hover:shadow-md transition-all`}
                        >
                          <div className="flex items-start gap-2">
                            <Icon className={`w-4 h-4 mt-0.5 ${eventType.textColor}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold ${eventType.textColor} truncate`}>
                                {event.title}
                              </p>
                              {event.description && (
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                  {event.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Próximos Eventos */}
            <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              <CardHeader className="border-b border-gray-200 dark:border-gray-800">
                <CardTitle className="text-gray-900 dark:text-gray-100 text-base">
                  Próximos Eventos
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {upcomingEvents.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    Nenhum evento agendado
                  </p>
                ) : (
                  <div className="space-y-2">
                    {upcomingEvents.map(event => {
                      const eventType = EVENT_TYPES[event.type];
                      const Icon = eventType.icon;
                      return (
                        <Link
                          key={event.id}
                          to={`${createPageUrl("CollectionTicketView")}?id=${event.ticket_id}`}
                          className={`block p-3 rounded-lg border ${eventType.borderColor} ${eventType.bgLight} hover:shadow-md transition-all`}
                        >
                          <div className="flex items-start gap-2">
                            <Icon className={`w-4 h-4 mt-0.5 ${eventType.textColor}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold ${eventType.textColor} truncate`}>
                                {event.title}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {format(parseISO(event.date), "dd/MM/yyyy", { locale: ptBR })}
                              </p>
                              {event.description && (
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                  {event.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Eventos do Dia Selecionado */}
            {selectedDate && (
              <Card className="border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-900">
                <CardHeader className="bg-purple-50 dark:bg-purple-950 border-b border-purple-200 dark:border-purple-800">
                  <CardTitle className="text-purple-900 dark:text-purple-100 text-base">
                    {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {eventsForSelectedDate.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      Nenhum evento neste dia
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {eventsForSelectedDate.map(event => {
                        const eventType = EVENT_TYPES[event.type];
                        const Icon = eventType.icon;
                        return (
                          <Link
                            key={event.id}
                            to={`${createPageUrl("CollectionTicketView")}?id=${event.ticket_id}`}
                            className={`block p-3 rounded-lg border ${eventType.borderColor} ${eventType.bgLight} hover:shadow-md transition-all`}
                          >
                            <div className="flex items-start gap-2">
                              <Icon className={`w-4 h-4 mt-0.5 ${eventType.textColor}`} />
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold ${eventType.textColor} truncate`}>
                                  {event.title}
                                </p>
                                {event.description && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                    {event.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}