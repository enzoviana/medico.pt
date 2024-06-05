const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const moment = require('moment-timezone');
const multer = require('multer');
const nodemailer = require('nodemailer');
const hbs = require('nodemailer-express-handlebars');
const path = require('path');
const fs = require('fs');
const https = require('https')


const app = express();
const port = process.env.PORT || 3000;

const key = fs.readFileSync('./private.key');
const cert = fs.readFileSync('./certificate.crt');

const cred = {
    key,
    cert
}

app.use(bodyParser.json());

app.use(cors({
    origin: 'https://datafuse-test.site',
}));
// URL de connexion à MongoDB en local
const uri = "mongodb+srv://medicoEnzo:u1ZYLpVlqCyNwDGz@medico.u5xpjbz.mongodb.net/?retryWrites=true&w=majority&appName=Medico";

const secretKey = '4a4551fa5e6997a82e57cabce96a2ebde3297f3228842f23a1efe62ed8c5ee7a4ebc45a1cd69e1c7819dd35bdab5c7411fa7dc2e73f9fa9b434462d47f30659b';


// Fonction de création d'un token JWT
function generateToken(userId) {
    return jwt.sign({ userId }, secretKey, { expiresIn: '1h' });
}

// Middleware pour vérifier l'authentification
function authenticate(req, res, next) {
    const token = req.headers.authorization;

    if (!token) {
        return res.status(401).json({ message: 'Token manquant.' });
    }

    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Token invalide.' });
        }
        req.userId = decoded.userId;
        next();
    });
}

// Middleware pour se connecter à la base de données avant de traiter les requêtes
app.use(async (req, res, next) => {
    try {
        const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
        await client.connect();
        req.db = client.db('medicopt');
        next();
    } catch (error) {
        res.status(500).send('Erreur de connexion à la base de données');
    }
});

// Route pour créer un patient
app.post('/signup/patient', async (req, res) => {
    try {
        const db = req.db;

        // Récupération des données du formulaire
        const { email, password, nom, prenom, sex, taille, date_de_naissance, numero,adresse,code_postal,ville, } = req.body;

        // Vérification si l'utilisateur existe déjà
        const existingUser = await db.collection('patient').findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Cet utilisateur existe déjà.' });
        }

        // Hachage du mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);

        // Création du nouveau patient
        const newPatient = {
            email,
            password: hashedPassword,
            nom,
            prenom,
            sex,
            taille,
            date_de_naissance,
            numero,
            adresse,
            code_postal,
            ville,

            UserTYPE: 'patient',
        };

        // Insertion du nouveau patient dans la collection 'patient'
        await db.collection('patient').insertOne(newPatient);

        // Réponse réussie
        res.status(201).json({ message: 'Patient créé avec succès.' });
    } catch (error) {
        console.error('Erreur lors de la création du patient :', error);
        res.status(500).json({ message: 'Erreur lors de la création du patient.' });
    }
});

// Route pour la connexion d'un utilisateur
app.post('/login', async (req, res) => {
    try {
        const db = req.db;

        // Récupération des données du formulaire
        const { email, password } = req.body;

        // Recherche de l'utilisateur dans la collection 'patient'
        const user = await db.collection('patient').findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }

        // Vérification du mot de passe
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ message: 'Mot de passe incorrect.' });
        }

        // Authentification réussie, génération du token JWT
        const token = generateToken(user._id);
        const nom = user.nom;
        const prenom = user.prenom;
        const UserTYPE = user.UserTYPE;
        const patientId = user._id

        // Retourner le token JWT
        res.status(200).json({ token , nom , prenom , UserTYPE, patientId});
    } catch (error) {
        console.error('Erreur lors de la tentative de connexion :', error);
        res.status(500).json({ message: 'Erreur lors de la tentative de connexion.' });
    }
});

// Route pour obtenir les informations de l'utilisateur authentifié


app.get('/profile', authenticate, async (req, res) => {
    try {
        const db = req.db;

        // Récupération des informations de l'utilisateur à partir de son ID
        const user = await db.collection('patient').findOne({ _id: new ObjectId(req.userId) });
        if (!user) {
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }

        // Retourner les informations de l'utilisateur
        res.status(200).json(user);
    } catch (error) {
        console.error('Erreur lors de la récupération des informations de l\'utilisateur :', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des informations de l\'utilisateur.' });
    }
});


// Route pour mettre à jour les informations de l'utilisateur authentifié
app.put('/profile', authenticate, async (req, res) => {
    try {
        const db = req.db;

        // Récupération des nouvelles informations de l'utilisateur à partir du corps de la requête
        const updatedInfo = req.body;

        // Mise à jour des informations de l'utilisateur dans la base de données
        const result = await db.collection('patient').updateOne({ _id: ObjectId(req.userId) }, { $set: updatedInfo });
        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }

        // Retourner un message de succès
        res.status(200).json({ message: 'Informations de l\'utilisateur mises à jour avec succès.' });
    } catch (error) {
        console.error('Erreur lors de la mise à jour des informations de l\'utilisateur :', error);
        res.status(500).json({ message: 'Erreur lors de la mise à jour des informations de l\'utilisateur.' });
    }
});

// Route pour créer un médecin
app.post('/signup/doctor', async (req, res) => {
    try {
        // Connexion à la base de données
        const db = req.db;
        
        // Récupération des données du formulaire
        const { email, password, nom, prenom, specialite, tel, adresse, ville, code_postal, description, horaire, service, events } = req.body;

        // Vérification si le médecin existe déjà
        const existingDoctor = await db.collection('doctor').findOne({ email });
        if (existingDoctor) {
            return res.status(400).json({ message: 'Ce médecin existe déjà.' });
        }

        // Hachage du mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);

        // Création du nouveau médecin avec la propriété timeslot initialisée à un tableau vide
       // Création du nouveau médecin avec la propriété timeslot initialisée à un objet vide
const newDoctor = {
    email,
    password: hashedPassword,
    nom,
    prenom,
    specialite,
    tel,
    adresse,
    ville,
    code_postal,
    description,
    horaire: [
        {
            "jour": "Segunda-feira",
            "debut": "08:00",
            "fin": "20:00",
            "ferme": false
          },
          {
            "jour": "Terça-feira",
            "debut": "08:00",
            "fin": "20:00",
            "ferme": false
          },
          {
            "jour": "Quarta-feira",
            "debut": "08:00",
            "fin": "20:00",
            "ferme": false
          },
          {
            "jour": "Quinta-feira",
            "debut": "08:00",
            "fin": "20:00",
            "ferme": false
          },
          {
            "jour": "Sexta-feira",
            "debut": "08:00",
            "fin": "20:00",
            "ferme": false
          },
          {
            "jour": "Sábado",
            "debut": "08:00",
            "fin": "20:00",
            "ferme": true
          },
          {
            "jour": "Domingo",
            "debut": "08:00",
            "fin": "20:00",
            "ferme": true
          },

    ], 
    service: [],
    timeslot: {}, // Initialisation de la propriété timeslot à un objet vide
    events: [],
};




        // Insertion du nouveau médecin dans la collection 'doctor'
        await db.collection('doctor').insertOne(newDoctor);

        // Réponse réussie
        res.status(201).json({ message: 'Médecin créé avec succès.' });
    } catch (error) {
        console.error('Erreur lors de la création du médecin :', error);
        res.status(500).json({ message: 'Erreur lors de la création du médecin.' });
    }
});

// Route pour la connexion d'un médecin

app.post('/login/doctor', async (req, res) => {
    try {
        const db = req.db;

        // Récupération des données du formulaire
        const { email, password } = req.body;

        // Recherche de l'utilisateur dans la collection 'doctor'
        const user = await db.collection('doctor').findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }

        // Vérification du mot de passe
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ message: 'Mot de passe incorrect.' });
        }

        // Authentification réussie, génération du token JWT
        const token = generateToken(user._id);
        const id = user._id;



        // Retourner le token JWT
        res.status(200).json({ token , id });
        console.log(id);
    } catch (error) {
        console.error('Erreur lors de la tentative de connexion :', error);
        res.status(500).json({ message: 'Erreur lors de la tentative de connexion.' });
    }
}
);

 

// Route pour obtenir les informations de l'utilisateur authentifié
app.get('/profile/doctor', authenticate, async (req, res) => {
    try {
        const db = req.db;

        // Récupération des informations de l'utilisateur à partir de son ID
        const user = await db.collection('doctor').findOne({ _id: new ObjectId(req.userId) });
        if (!user) {
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }

        // Retourner les informations de l'utilisateur
        res.status(200).json(user);
    } catch (error) {
        console.error('Erreur lors de la récupération des informations de l\'utilisateur :', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des informations de l\'utilisateur.' });
    }
});

// recupere tout les docteurs 

const geolib = require('geolib');

app.get('/doctors', async (req, res) => {
    try {
        const db = req.db;
        let query = { availability: true }; // Ajout du filtre pour la disponibilité à true

        // Filtrer par spécialité
        if (req.query.specialite) {
            const specialiteRegex = new RegExp(req.query.specialite, 'i');
            query.specialite = specialiteRegex;
        }

        // Filtrer par ville
        if (req.query.ville) {
            const villeRegex = new RegExp(req.query.ville, 'i');
            query.ville = villeRegex;
        }

        // Filtrer par service
        if (req.query.service) {
            const serviceRegex = new RegExp(req.query.service, 'i');
            query.service = serviceRegex;
        }

        // Filtrer par géolocalisation dans un rayon spécifié
        if (req.query.latitude && req.query.longitude && req.query.distance) {
            const latitude = parseFloat(req.query.latitude);
            const longitude = parseFloat(req.query.longitude);
            const distance = parseInt(req.query.distance); // distance en mètres
            const doctors = await db.collection('doctor').find({ availability: true }).toArray();
            const filteredDoctors = doctors.filter(doctor => {
                return geolib.isPointWithinRadius(
                    { latitude: doctor.latitude, longitude: doctor.longitude },
                    { latitude, longitude },
                    distance
                );
            });
            res.status(200).json(filteredDoctors);
        } else {
            const doctors = await db.collection('doctor').find(query).toArray();
            res.status(200).json(doctors);
        }
    } catch (error) {
        console.error('Erreur lors de la récupération des médecins :', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des médecins.' });
    }
});


app.get('/services', async (req, res) => {
    try {
        const db = req.db;
        const services = await db.collection('doctor').distinct('service');
        res.status(200).json(services);
    } catch (error) {
        console.error('Erreur lors de la récupération des services :', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des services.' });
    }
});


// recupere un docteur par son id avec comme info nom prenom description addresse telephone email horaire et specialite

app.get('/doctors/:id', async (req, res) => {
    try {
        const db = req.db;
        const doctor = await db.collection('doctor').findOne({ _id: new ObjectId(req.params.id) });
        if (!doctor) {
            return res.status(404).json({ message: 'Médecin non trouvé.' });
        }
        res.status(200).json(doctor);
    } catch (error) {
        console.error('Erreur lors de la récupération du médecin :', error);
        res.status(500).json({ message: 'Erreur lors de la récupération du médecin.' });
    }
}
);

// Route pour mettre à jour les informations de l'utilisateur authentifié

app.put('/profile/doctor', authenticate, async (req, res) => {
    try {
        const db = req.db;

        // Récupération des nouvelles informations de l'utilisateur à partir du corps de la requête
        const updatedInfo = req.body;

        // Mise à jour des informations de l'utilisateur dans la base de données

       

        const result = await db.collection('doctor').updateOne({ _id: new ObjectId(req.userId) }, { $set: updatedInfo });

        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }

        // Vérifier si les plages horaires sont incluses dans les nouvelles informations
       

        // Retourner un message de succès
        res.status(200).json({ message: 'Informations de l\'utilisateur mises à jour avec succès.' });
    } catch (error) {
        console.error('Erreur lors de la mise à jour des informations de l\'utilisateur :', error);
        res.status(500).json({ message: 'Erreur lors de la mise à jour des informations de l\'utilisateur.' });
    }
});


const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'enzo.pereirapro@gmail.com',
        pass: 'ixbf ombb lkku pxdt'
    },
});

transporter.use('compile', hbs({
    viewEngine: {
        extName: '.hbs',
        partialsDir: path.resolve('./email_templates'),
        defaultLayout: false,
    },
    viewPath: path.resolve('./email_templates'),
    extName: '.hbs',
}));

// Route pour créer un rendez-vous dans une nouvelle collection Events
app.post('/events', authenticate, async (req, res) => {
    try {
        const db = req.db;

        // Récupération des données du formulaire avec le format spécifié
        let { debut, fin, description, client, color, title, medecin, patientId } = req.body;

        // Vérification si le rendez-vous existe déjà
        const existingEvent = await db.collection('events').findOne({ medecin, debut });
        if (existingEvent) {
            return res.status(400).json({ message: 'Ce rendez-vous existe déjà.' });
        }

        // Récupération des emails du docteur et du patient
        const doctor = await db.collection('doctor').findOne({ _id: new ObjectId(medecin) });
        const patient = await db.collection('patient').findOne({ _id: new ObjectId(patientId) });

        if (!doctor || !patient) {
            return res.status(404).json({ message: 'Docteur ou patient non trouvé.' });
        }

        await db.collection('doctor_patient_lists').updateOne(
            { doctorId: medecin },
            { $addToSet: { patients: patientId } },
            { upsert: true }
        );

        const doctorEmail = doctor.email;
        const doctorNom = doctor.nom;
        const doctorPrenom = doctor.prenom;
        const patientEmail = patient.email;
        const patientNom = patient.nom;
        const patientPrenom = patient.prenom;
        const service = description

        // Création du nouveau rendez-vous avec le nouveau format
        const newEvent = {
            doctorId: medecin,
            start: debut,
            end: fin,
            service,
            description: '',
            client,
            color,
            title,
            patientId: patientId,
            doctorNom,
            doctorPrenom,
            patientNom,
            patientPrenom,
            status : 'Programmer',

        };

        // Insertion du nouveau rendez-vous dans la collection 'events'
        await db.collection('events').insertOne(newEvent);

        // Envoi de l'email au docteur
        const doctorMailOptions = {
            from: 'votre_email@gmail.com',
            to: doctorEmail,
            subject: 'Nouveau Rendez-vous avec un Patient',
            template: 'doctor',
            context: {
                doctorName: `${doctor.nom} ${doctor.prenom}`,
                patientName: `${patient.nom} ${patient.prenom}`,
                lieu : `${doctor.adresse}`,
                debut,
                fin,
                description
            }
        };

        transporter.sendMail(doctorMailOptions, (error, info) => {
            if (error) {
                console.error('Erreur lors de l\'envoi de l\'email au docteur :', error);
            } else {
                console.log('Email envoyé au docteur :', info.response);
            }
        });

        // Envoi de l'email au patient
        const patientMailOptions = {
            from: 'votre_email@gmail.com',
            to: patientEmail,
            subject: 'Confirmation de votre Rendez-vous Médical',
            template: 'patient',
            context: {
                doctorName: `${doctor.nom} ${doctor.prenom}`,
                patientName: `${patient.nom} ${patient.prenom}`,
                lieu : `${doctor.adresse}`,
                debut,
                fin,
                description
            }
        };

        transporter.sendMail(patientMailOptions, (error, info) => {
            if (error) {
                console.error('Erreur lors de l\'envoi de l\'email au patient :', error);
            } else {
                console.log('Email envoyé au patient :', info.response);
            }
        });

        // Réponse réussie
        res.status(201).json({ message: 'Rendez-vous créé avec succès.', event: newEvent });
    } catch (error) {
        console.error('Erreur lors de la création du rendez-vous :', error);
        res.status(500).json({ message: 'Erreur lors de la création du rendez-vous.' });
    }
});


// Route pour obtenir les rendez-vous d'un utilisateur authentifié

app.get('/events', authenticate, async (req, res) => { 
    try {
        const db = req.db;

        // Récupération des rendez-vous de l'utilisateur à partir de son ID
        const events = await db.collection('events').find({ doctorId: req.userId }).toArray();
        res.status(200).json(events);
    } catch (error) {
        console.error('Erreur lors de la récupération des rendez-vous :', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des rendez-vous.' });
    }
}
);

app.get('/events/patient', authenticate, async (req, res) => { 
    try {
        const db = req.db;

        // Récupération des rendez-vous de l'utilisateur à partir de son ID
        const events = await db.collection('events').find({ patientId: req.userId }).toArray();
        res.status(200).json(events);
    } catch (error) {
        console.error('Erreur lors de la récupération des rendez-vous :', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des rendez-vous.' });
    }
}
);

// Route pour supprimer un rendez-vous

app.delete('/events/:id', authenticate, async (req, res) => { 
    try {
        const db = req.db;

        // Suppression du rendez-vous à partir de son ID
        const result = await db.collection('events').deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Rendez-vous non trouvé.' });
        }

        // Réponse réussie
        res.status(200).json({ message: 'Rendez-vous supprimé avec succès.' });
    } catch (error) {
        console.error('Erreur lors de la suppression du rendez-vous :', error);
        res.status(500).json({ message: 'Erreur lors de la suppression du rendez-vous.' });
    }
}
);

// route pour modifier un rendez-vous

app.put('/events/:id', authenticate, async (req, res) => {
    try {
        const db = req.db;

        // Récupération des nouvelles informations du rendez-vous à partir du corps de la requête
        const updatedInfo = req.body;

        // Mise à jour des informations du rendez-vous dans la base de données
        const result = await db.collection('events').updateOne({ _id: new ObjectId(req.params.id) }, { $set: updatedInfo });
        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'Rendez-vous non trouvé.' });
        }

        // Retourner un message de succès
        res.status(200).json({ message: 'Rendez-vous mis à jour avec succès.' });
    } catch (error) {
        console.error('Erreur lors de la mise à jour du rendez-vous :', error);
        res.status(500).json({ message: 'Erreur lors de la mise à jour du rendez-vous.' });
    }
}
);

// Available Timeslot per doctor 

// Route pour obtenir les créneaux horaires disponibles pour un médecin spécifique

app.get('/timeslots/:doctorId', async (req, res) => {
    try {
        const db = req.db;
        const doctorId = req.params.doctorId;
        const specificDate = req.query.date ? new Date(req.query.date) : new Date(); // Récupérer la date spécifique de la requête, sinon utiliser la date actuelle
        const specificDuration = parseInt(req.query.duration, 10);

        // Récupération des informations du médecin
        const doctor = await db.collection('doctor').findOne({ _id: new ObjectId(doctorId) });
        if (!doctor) {
            return res.status(404).json({ message: 'Médecin non trouvé.' });
        }

        // Vérifier si les heures de travail sont définies pour le médecin
        if (!doctor.horaire || !Array.isArray(doctor.horaire)) {
            return res.status(400).json({ message: 'Les heures de travail du médecin ne sont pas définies correctement.' });
        }

        // Récupération des rendez-vous du médecin
        const doctorEvents = await db.collection('events').find({ doctorId }).toArray();
        console.log(doctorEvents)
        // Générer les plages horaires disponibles en fonction des horaires de travail du médecin et de la date spécifique
        const horaires = doctor.horaire;
        const availableTimeslots = generateAvailableTimeslotsForDate(horaires, doctorEvents, specificDate, specificDuration);

        // Transformation des plages horaires en format ISO
        const isoTimeslots = availableTimeslots.map(slot => {
            return { start: new Date(slot.start).toISOString(), end: new Date(slot.end).toISOString() };
        });

        res.status(200).json(isoTimeslots);
    } catch (error) {
        console.error('Erreur lors de la récupération des créneaux horaires disponibles :', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des créneaux horaires disponibles.' });
    }
});

app.get('/doctor/patient-lists', authenticate, async (req, res) => {
    try {
        const db = req.db;

        // Vérifier si l'ID du docteur est valide
        if (!ObjectId.isValid(req.userId)) {
            return res.status(400).json({ message: 'ID de docteur invalide.' });
        }

        // Recherche des informations du docteur
        const doctor = await db.collection('doctor').findOne({ _id: new ObjectId(req.userId) });
        if (!doctor) {
            return res.status(404).json({ message: 'Docteur non trouvé.' });
        }

        const Id = req.userId
        console.log(Id)
        // Recherche des listes de patients pour le docteur spécifié
        const doctorPatientLists = await db.collection('doctor_patient_lists').findOne({ doctorId: Id });
        
        if (!doctorPatientLists) {
            return res.status(404).json({ message: 'Aucune liste de patients trouvée pour ce docteur.' });
        }

        const patientIds = doctorPatientLists.patients.map(id => new ObjectId(id));

        console.log('patientIds', patientIds)
        // Rechercher les informations des patients
        const patients = await db.collection('patient').find({ _id: { $in: patientIds } }).toArray();
        console.log('patients', patients)
        // Extraire les noms et prénoms des patients
        const patientInfo = patients.map(patient => ({
            id : patient._id,
            firstName: patient.nom,
            lastName: patient.prenom,
            email: patient.email,
            sexe : patient.sex,
            date_de_naissance : patient.date_de_naissance,
            numero: patient.numero,
            adresse: patient.adresse,
            code_postal: patient.code_postal,
            ville: patient.ville
            
        }));

        // Retourner les informations du docteur et les listes de patients
        res.status(200).json({
            patientInfo
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des informations du docteur et des listes de patients :', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des informations du docteur et des listes de patients.' });
    }
});

app.get('/doctor/patient-info/:patientId', authenticate, async (req, res) => {
    try {
        const db = req.db;
        const patientId = req.params.patientId;

        // Vérifier si l'ID du patient est valide
        if (!ObjectId.isValid(patientId)) {
            return res.status(400).json({ message: 'ID de patient invalide.' });
        }

        // Recherche des informations du patient
        const patient = await db.collection('patient').findOne({ _id: new ObjectId(patientId) });
        if (!patient) {
            return res.status(404).json({ message: 'Patient non trouvé.' });
        }

        // Préparer les informations du patient à retourner
        const patientInfo = {
            id: patient._id,
            firstName: patient.nom,
            lastName: patient.prenom,
            email: patient.email,
            sexe : patient.sex,
            date_de_naissance : patient.date_de_naissance,
            numero: patient.numero,
            adresse: patient.adresse,
            code_postal: patient.code_postal,
            ville: patient.ville
        };

        // Retourner les informations du patient
        res.status(200).json(patientInfo);
    } catch (error) {
        console.error('Erreur lors de la récupération des informations du patient :', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des informations du patient.' });
    }
});

app.get('/doctor/patient-appointments/:patientId', authenticate, async (req, res) => {
    try {
        const db = req.db;
        const patientId = req.params.patientId;
        const doctorId = req.userId; // Utilisation de req.userId défini par le middleware

        // Vérifier si l'ID du patient est valide
        if (!ObjectId.isValid(patientId)) {
            return res.status(400).json({ message: 'ID de patient invalide.' });
        }

        // Recherche des rendez-vous du patient avec le docteur connecté
        const appointments = await db.collection('events').find({
            patientId: patientId,
            doctorId: doctorId
        }).toArray();

        // Vérifier si des rendez-vous existent
        if (appointments.length === 0) {
            return res.status(404).json({ message: 'Aucun rendez-vous trouvé pour ce patient avec le docteur connecté.' });
        }

        // Retourner les informations des rendez-vous
        res.status(200).json(appointments);
    } catch (error) {
        console.error('Erreur lors de la récupération des rendez-vous du patient :', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des rendez-vous du patient.' });
    }
});


// Configuration de multer pour le stockage des fichiers
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Dossier où les fichiers seront stockés
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`); // Nom du fichier
    }
});

const upload = multer({ storage });


app.post('/doctor/upload/:patientId', authenticate, upload.array('files'), async (req, res) => {
    try {
        const db = req.db;
        const patientId = req.params.patientId;

        // Vérifier si l'ID du patient est valide
        if (!ObjectId.isValid(patientId)) {
            return res.status(400).json({ message: 'ID de patient invalide.' });
        }

        // Recherche des informations du patient
        const patient = await db.collection('patient').findOne({ _id: new ObjectId(patientId) });
        if (!patient) {
            return res.status(404).json({ message: 'Patient non trouvé.' });
        }

        // Si des fichiers sont téléchargés, ajouter leurs informations à la base de données
        if (req.files && req.files.length > 0) {
            const filesInfo = req.files.map(file => ({
                filename: file.filename,
                originalname: file.originalname,
                path: file.path,
                mimetype: file.mimetype,
                size: file.size,
                uploadDate: new Date()
            }));

            // Mise à jour de la collection patient avec les nouvelles informations des fichiers
            await db.collection('patient').updateOne(
                { _id: new ObjectId(patientId) },
                { $push: { files: { $each: filesInfo } } }
            );
        }

        res.status(200).json({ message: 'Fichiers téléchargés avec succès.' });
    } catch (error) {
        console.error('Erreur lors du téléchargement des fichiers :', error);
        res.status(500).json({ message: 'Erreur lors du téléchargement des fichiers.' });
    }
});

app.get('/doctor/download/:patientId/:fileName', authenticate, async (req, res) => {
    try {
        const db = req.db;
        const patientId = req.params.patientId;
        const fileName = req.params.fileName;

        // Vérifier si l'ID du patient est valide
        if (!ObjectId.isValid(patientId)) {
            return res.status(400).json({ message: 'ID de patient invalide.' });
        }

        // Recherche des informations du patient
        const patient = await db.collection('patient').findOne({ _id: new ObjectId(patientId) });
        if (!patient) {
            return res.status(404).json({ message: 'Patient non trouvé.' });
        }

        // Vérifier si le fichier existe dans les fichiers du patient
        const file = patient.files.find(file => file.filename === fileName);
        if (!file) {
            return res.status(404).json({ message: 'Fichier non trouvé.' });
        }

        // Récupérer le chemin complet du fichier
        const filePath = path.join(__dirname, file.path);

        // Vérifier si le fichier existe sur le serveur
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                console.error('Le fichier n\'existe pas:', err);
                return res.status(404).json({ message: 'Le fichier n\'existe pas.' });
            }

            // Télécharger le fichier
            res.download(filePath, file.originalname);
        });
    } catch (error) {
        console.error('Erreur lors du téléchargement du fichier :', error);
        res.status(500).json({ message: 'Erreur lors du téléchargement du fichier.' });
    }
});

// Endpoint pour récupérer tous les fichiers téléchargés pour un patient spécifique
app.get('/doctor/files/:patientId', authenticate, async (req, res) => {
    try {
        const db = req.db;
        const patientId = req.params.patientId;

        // Vérifier si l'ID du patient est valide
        if (!ObjectId.isValid(patientId)) {
            return res.status(400).json({ message: 'ID de patient invalide.' });
        }

        // Recherche des informations du patient
        const patient = await db.collection('patient').findOne({ _id: new ObjectId(patientId) });
        if (!patient) {
            return res.status(404).json({ message: 'Patient non trouvé.' });
        }

        // Renvoyer la liste des fichiers du patient
        res.status(200).json({ files: patient.files });
    } catch (error) {
        console.error('Erreur lors de la récupération des fichiers du patient :', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des fichiers du patient.' });
    }
});


const crypto = require('crypto');
// Route pour réinitialiser le mot de passe d'un utilisateur
app.post('/reset-password', async (req, res) => {
    try {
        const db = req.db;
        const { email } = req.body;

        // Vérification si l'utilisateur existe
        const existingUser = await db.collection('patient').findOne({ email });
        if (!existingUser) {
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }

        // Génération d'un jeton unique pour réinitialiser le mot de passe
        const token = crypto.randomBytes(20).toString('hex');

        // Mise à jour du jeton de réinitialisation dans la base de données
        await db.collection('patient').updateOne({ email }, { $set: { resetPasswordToken: token, resetPasswordExpires: Date.now() + 3600000 } });


        const resetLink = `http://localhost:8080/reset-password/${token}`; // Définissez correctement votre lien de réinitialisation

        const mailOptions = {
            from: 'votre@email.com',
            to: email,
            subject: 'Réinitialisation de votre mot de passe',
            template: 'resetPassword',
            context: {
                resetLink: resetLink
            }
        };
        
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Erreur lors de l\'envoi de l\'e-mail :', error);
                return res.status(500).json({ message: 'Erreur lors de l\'envoi de l\'e-mail.' });
            }
            console.log('E-mail envoyé :', info.response);
            res.status(200).json({ message: 'Un e-mail de réinitialisation a été envoyé.' });
        });

    } catch (error) {
        console.error('Erreur lors de la réinitialisation du mot de passe :', error);
        res.status(500).json({ message: 'Erreur lors de la réinitialisation du mot de passe.' });
    }
});

app.post('/resetpassword/:token', async (req, res) => {
    try {
        const db = req.db;
        const { password } = req.body;
        const { token } = req.params;

        // Vérification si le token est valide et s'il existe dans la base de données
        const user = await db.collection('patient').findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });
        if (!user) {
            return res.status(400).json({ message: 'Le lien de réinitialisation du mot de passe est invalide ou a expiré.' });
        }

        // Mettre à jour le mot de passe de l'utilisateur
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.collection('patient').updateOne({ _id: user._id }, { $set: { password: hashedPassword, resetPasswordToken: null, resetPasswordExpires: null } });

        // Envoyer une réponse de succès
        res.status(200).json({ message: 'Le mot de passe a été réinitialisé avec succès.' });
    } catch (error) {
        console.error('Erreur lors de la réinitialisation du mot de passe :', error);
        res.status(500).json({ message: 'Erreur lors de la réinitialisation du mot de passe.' });
    }
});


// Fonction pour générer les créneaux horaires disponibles en fonction d'une date spécifique
function generateAvailableTimeslotsForDate(horaires, bookedEvents, specificDate, specificDuration) {
    const availableTimeslots = [];
    const specificDay = specificDate.toLocaleDateString('pt-PT', { weekday: 'long' }).toLowerCase();
    const horairesForSpecificDay = horaires.find(horaire => horaire.jour.toLowerCase() === specificDay);

    if (!horairesForSpecificDay || horairesForSpecificDay.ferme) {
        return availableTimeslots;
    }

    const { debut, fin } = horairesForSpecificDay;
    if (!debut || !fin) {
        return availableTimeslots;
    }

    const [startHourInt, startMinute] = debut.split(':').map(Number);
    const [endHourInt, endMinute] = fin.split(':').map(Number);

    // Création d'un objet Date en utilisant la date spécifique et en ajustant l'heure de début
    let currentTime = new Date(specificDate);
    currentTime.setHours(startHourInt, startMinute, 0, 0);

    // Tant que l'heure actuelle est avant l'heure de fin
    while (currentTime.getHours() < endHourInt || (currentTime.getHours() === endHourInt && currentTime.getMinutes() < endMinute)) {
        // Création de l'heure de fin en ajoutant la durée spécifique à l'heure actuelle
        const endTime = new Date(currentTime);
        endTime.setMinutes(endTime.getMinutes() + specificDuration);

        // Vérification de la disponibilité en fonction des événements réservés
        const isAvailable = !bookedEvents.some(event => {
            const eventStart = new Date(event.start);
            const eventEnd = new Date(event.end);
            return (currentTime >= eventStart && currentTime < eventEnd) ||
                (endTime > eventStart && endTime <= eventEnd) ||
                (currentTime < eventStart && endTime > eventEnd);
        });

        // Si le créneau horaire est disponible, l'ajouter à la liste des créneaux disponibles
        if (isAvailable) {
            availableTimeslots.push({ start: currentTime.toISOString(), end: endTime.toISOString() });
        }

        // Passage au prochain créneau horaire (30 minutes)
        currentTime.setMinutes(currentTime.getMinutes() + 30);
    }

    return availableTimeslots;
}

app.get('/.well-known/pki-validation/C2D64616FA133B0877524AB2B07094D7.txt', (req, res) => {
    res.sendFile(path.join(__dirname, './.well-known/pki-validation/C2D64616FA133B0877524AB2B07094D7.txt'));
});


// Démarrer le serveur
app.listen(port, '0.0.0.0', () => {
    console.log(`Server test final listening at http://0.0.0.0:${port}`);
});

const httpsServer = https.createServer(cred, app)
httpsServer.listen(8433)