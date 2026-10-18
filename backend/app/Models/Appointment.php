<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Appointment extends Model
{
    use HasFactory;

    protected $fillable = [
        'patient_id',
        'staff_profile_id',
        'date',
        'time',
        'reason',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date',
        ];
    }

    public function patient()
    {
        return $this->belongsTo(Patient::class);
    }

    public function staffProfile()
    {
        return $this->belongsTo(StaffProfile::class);
    }

    public function queueRecord()
    {
        return $this->hasOne(QueueRecord::class);
    }
}
