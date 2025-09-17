import { useEffect } from 'react';
import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';

const CalendarPanel = () => {
    useEffect(() => {
        const calendarEl = document.getElementById('calendar');
        if (!calendarEl) return;

        const calendar = new Calendar(calendarEl, {
            plugins: [dayGridPlugin, timeGridPlugin, listPlugin],
            initialView: 'dayGridMonth',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,listWeek'
            }
        });

        calendar.render();

        // Cleanup function to destroy calendar when component unmounts
        return () => {
            calendar.destroy();
        };
    }, []);

    return (
        <div id="calendar" className="min-w-[400px] min-h-[400px]" />
    );
};

export default CalendarPanel;

