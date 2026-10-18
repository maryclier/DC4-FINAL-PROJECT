<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class QueueRecord extends Model
{
    use HasFactory;

    protected $fillable = [
        'appointment_id',
        'queue_number',
        'queue_date',
        'arrival_time',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'queue_date' => 'date',
            'arrival_time' => 'datetime',
        ];
    }

    public function appointment()
    {
        return $this->belongsTo(Appointment::class);
    }

    public function consultationRecord()
    {
        return $this->hasOne(ConsultationRecord::class);
    }
}
