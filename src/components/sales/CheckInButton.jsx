import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function CheckInButton({ leadId, onCheckIn, onCheckOut, currentVisit }) {
  const [loading, setLoading] = useState(false);

  const handleCheckIn = async () => {
    setLoading(true);
    
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          await onCheckIn({
            leadId: leadId,
            visitedAt: new Date().toISOString(),
            checkInLat: position.coords.latitude,
            checkInLng: position.coords.longitude,
          });
          setLoading(false);
        },
        (error) => {
          console.error("Erro ao obter localização:", error);
          alert("Não foi possível obter a localização. Tente novamente.");
          setLoading(false);
        }
      );
    } else {
      alert("Geolocalização não disponível neste dispositivo.");
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setLoading(true);
    
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const checkInTime = new Date(currentVisit.visitedAt);
          const checkOutTime = new Date();
          const durationMinutes = Math.round((checkOutTime - checkInTime) / (1000 * 60));
          
          await onCheckOut({
            checkOutAt: checkOutTime.toISOString(),
            checkOutLat: position.coords.latitude,
            checkOutLng: position.coords.longitude,
            durationMinutes: durationMinutes,
          });
          setLoading(false);
        },
        (error) => {
          console.error("Erro ao obter localização:", error);
          alert("Não foi possível obter a localização. Tente novamente.");
          setLoading(false);
        }
      );
    } else {
      alert("Geolocalização não disponível neste dispositivo.");
      setLoading(false);
    }
  };

  if (currentVisit && !currentVisit.checkOutAt) {
    const checkInTime = new Date(currentVisit.visitedAt);
    const elapsed = Math.round((new Date() - checkInTime) / (1000 * 60));
    
    return (
      <div className="space-y-2">
        <Badge className="bg-green-100 text-green-700 w-full justify-center py-2">
          <Clock className="w-4 h-4 mr-2" />
          Check-in ativo • {elapsed} min
        </Badge>
        <Button
          onClick={handleCheckOut}
          disabled={loading}
          className="w-full bg-orange-600 hover:bg-orange-700"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processando...
            </>
          ) : (
            <>
              <MapPin className="w-4 h-4 mr-2" />
              Fazer Check-out
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <Button
      onClick={handleCheckIn}
      disabled={loading}
      className="w-full bg-blue-600 hover:bg-blue-700"
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Processando...
        </>
      ) : (
        <>
          <MapPin className="w-4 h-4 mr-2" />
          Fazer Check-in
        </>
      )}
    </Button>
  );
}